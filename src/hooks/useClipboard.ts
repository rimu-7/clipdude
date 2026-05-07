import { useEffect, useState, useRef, useCallback } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import Database from "@tauri-apps/plugin-sql";
import { join } from "@tauri-apps/api/path";
import { load } from "@tauri-apps/plugin-store";
import { toast } from "sonner";
import { Clip } from "../types";

export function useClipboard() {
  const [db, setDb] = useState<Database | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const lastClipRef = useRef<string>("");

  // Track the active search query so polling can respect it
  const activeSearchRef = useRef<string>("");
  // Counter to cancel out-of-order search responses
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    async function setup() {
      try {
        const store = await load("settings.json", {
          autoSave: true,
          defaults: {},
        } as any);
        const savedFolder = await store.get<{ path: string }>("db_folder");
        if (savedFolder?.path) await connectToDatabase(savedFolder.path);
      } catch (e) {
        console.error("Initialization failed", e);
        toast.error("Failed to load settings.");
      } finally {
        setIsInitializing(false);
      }
    }
    setup();
  }, []);

  const connectToDatabase = async (folderPath: string) => {
    try {
      const dbFilePath = await join(folderPath, "clipboard.db");
      const database = await Database.load(`sqlite:${dbFilePath}`);

      await database.execute(
        `CREATE TABLE IF NOT EXISTS clips (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT UNIQUE,
          is_pinned BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
      );

      // Silent migration
      try {
        await database.execute(
          `ALTER TABLE clips ADD COLUMN is_pinned BOOLEAN DEFAULT 0`,
        );
      } catch (e) {}

      await fetchHistory(database);
      setDb(database);
      setDbPath(folderPath);
      // Clear active search when changing DB
      activeSearchRef.current = "";
    } catch (error) {
      toast.error("Database connection failed");
    }
  };

  const fetchHistory = useCallback(async (database: Database) => {
    const rows = await database.select<Clip[]>(
      "SELECT id, content, is_pinned, created_at FROM clips ORDER BY is_pinned DESC, id DESC LIMIT 200",
    );
    setHistory(rows);
    if (rows.length > 0) lastClipRef.current = rows[0].content;
  }, []);

  // The bulletproof search – now with request ordering and ref tracking
  const searchClips = useCallback(
    async (query: string) => {
      if (!db) return;

      // Store the query for use by the polling interval
      activeSearchRef.current = query.trim();

      if (!query.trim()) {
        // Empty search → just reload the full list
        await fetchHistory(db);
        return;
      }

      // Increment request ID for this search
      const currentRequestId = ++searchRequestIdRef.current;
      try {
        const rows = await db.select<Clip[]>(
          `SELECT id, content, is_pinned, created_at FROM clips 
           WHERE content LIKE $1 
           ORDER BY is_pinned DESC, id DESC LIMIT 200`,
          [`%${query.trim()}%`],
        );

        // Only apply the result if it's still the latest request
        if (currentRequestId === searchRequestIdRef.current) {
          setHistory(rows);
        }
      } catch (e) {
        console.error("Search failed", e);
        // Optionally restore full history on error? For now, ignore.
      }
    },
    [db, fetchHistory],
  );

  // Insert a new clip without destroying the active search
  const addClip = useCallback(
    async (text: string) => {
      if (!db || !text || text === lastClipRef.current) return;
      try {
        lastClipRef.current = text;
        await db.execute("INSERT OR IGNORE INTO clips (content) VALUES ($1)", [
          text,
        ]);

        // After adding, refresh the view according to the current context
        if (activeSearchRef.current) {
          await searchClips(activeSearchRef.current);
        } else {
          await fetchHistory(db);
        }
      } catch (e) {
        // Silently ignore
      }
    },
    [db, searchClips, fetchHistory],
  );

  const togglePin = async (id: number, currentPinStatus: number) => {
    if (!db) return;
    try {
      const newStatus = currentPinStatus === 1 ? 0 : 1;

      // Optimistic UI
      setHistory((prev) =>
        [...prev]
          .map((c) => (c.id === id ? { ...c, is_pinned: newStatus } : c))
          .sort((a, b) => b.is_pinned - a.is_pinned || b.id - a.id),
      );

      await db.execute("UPDATE clips SET is_pinned = $1 WHERE id = $2", [
        newStatus,
        id,
      ]);
      toast.success(newStatus === 1 ? "Clip Pinned" : "Pin Removed");

      // Refresh data respecting the active search (pinning might change ordering)
      if (activeSearchRef.current) {
        await searchClips(activeSearchRef.current);
      } else {
        await fetchHistory(db);
      }
    } catch (e) {
      toast.error("Failed to update pin status");
      // Rollback: re-run the appropriate fetch
      if (activeSearchRef.current) {
        await searchClips(activeSearchRef.current);
      } else {
        await fetchHistory(db);
      }
    }
  };

  const deleteClip = async (id: number) => {
    if (!db) return;
    try {
      // Optimistic removal
      setHistory((prev) => prev.filter((c) => c.id !== id));
      await db.execute("DELETE FROM clips WHERE id = $1", [id]);

      // After deletion, if a search is active, re-run it to maintain correctness
      toast.success("Clip Deleted");
      if (activeSearchRef.current) {
        await searchClips(activeSearchRef.current);
      } else {
        await fetchHistory(db);
      }
    } catch (e) {
      toast.error("Failed to delete clip");
      // Rollback
      if (activeSearchRef.current) {
        await searchClips(activeSearchRef.current);
      } else {
        await fetchHistory(db);
      }
    }
  };

  const deleteByRange = async (range: "day" | "week" | "month") => {
    if (!db) return;
    const modifier =
      range === "day" ? "-1 day" : range === "week" ? "-7 days" : "-1 month";
    await db.execute(
      `DELETE FROM clips WHERE is_pinned = 0 AND created_at < datetime('now', $1)`,
      [modifier],
    );
    // After bulk delete, always go back to full history (search would be stale anyway)
    activeSearchRef.current = "";
    await fetchHistory(db);
    toast.success(`Cleared unpinned history older than a ${range}`);
  };

  const clearAllHistory = async () => {
    if (!db) return;
    try {
      await db.execute("DELETE FROM clips WHERE is_pinned = 0");
      activeSearchRef.current = "";
      await fetchHistory(db);
      toast.success("Unpinned history cleared");
    } catch (e) {
      toast.error("Failed to clear history");
    }
  };

  // Clipboard polling – now respects active search
  useEffect(() => {
    if (!db) return;

    const interval = setInterval(async () => {
      try {
        const text = await readText();
        if (text && text !== lastClipRef.current) {
          await addClip(text);
        }
      } catch (e) {
        // Clipboard read error (permissions, etc.)
      }
    }, 200);

    return () => clearInterval(interval);
  }, [db, addClip]); // addClip is now a stable callback

  return {
    history,
    dbPath,
    isInitializing,
    connectToDatabase,
    addClip,
    togglePin,
    deleteClip,
    deleteByRange,
    clearAllHistory,
    searchClips,
  };
}
