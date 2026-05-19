import { useEffect, useState, useRef, useCallback } from "react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import Database from "@tauri-apps/plugin-sql";
import { join, appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Clip, DEFAULT_SETTINGS } from "../types";
import { detectSensitiveData, isExcludedApp } from "../lib/privacy";

export function useClipboard() {
  const [db, setDb] = useState<Database | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [totalClips, setTotalClips] = useState(0);

  const lastClipRef = useRef<string>("");
  const activeSearchRef = useRef<string>("");
  const searchRequestIdRef = useRef(0);
  const dbRef = useRef<Database | null>(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);

  useEffect(() => { dbRef.current = db; }, [db]);

  useEffect(() => {
    async function setup() {
      try {
        const store = await load("settings.json", { autoSave: true, defaults: {} } as any);

        const settings = { ...DEFAULT_SETTINGS };
        const keys = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];
        for (const key of keys) {
          const saved = await store.get(key);
          if (saved !== null && saved !== undefined) {
            (settings as any)[key] = saved;
          }
        }
        settingsRef.current = settings;

        let folderPath: string | null = settings.db_folder || null;

        if (!folderPath) {
          const rawFolder = await store.get("db_folder");
          if (typeof rawFolder === "string") {
            folderPath = rawFolder;
          } else if (rawFolder && typeof rawFolder === "object" && "path" in (rawFolder as any)) {
            folderPath = (rawFolder as { path: string }).path;
          }
        }

        if (!folderPath) {
          const dir = await appDataDir();
          const dirExists = await exists(dir);
          if (!dirExists) {
            await mkdir(dir, { recursive: true });
          }
          folderPath = dir;
          await store.set("db_folder", folderPath);
          await store.save();
        }

        await connectToDatabase(folderPath);

        if (settings.excluded_apps?.length) {
          await invoke("set_excluded_apps", { apps: settings.excluded_apps }).catch(() => {});
        }

        if (typeof settings.monitor_enabled === "boolean") {
          await invoke("set_monitor_enabled", { enabled: settings.monitor_enabled }).catch(() => {});
        }
      } catch (e) {
        console.error("Initialization failed", e);
        toast.error("Failed to initialize. Please restart ClipDude.");
      } finally {
        setIsInitializing(false);
      }
    }
    setup();
  }, []);

  const ensureSchema = async (database: Database) => {
    await database.execute(
      `CREATE TABLE IF NOT EXISTS clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT UNIQUE,
        is_pinned INTEGER DEFAULT 0,
        source_app TEXT DEFAULT '',
        is_sensitive INTEGER DEFAULT 0,
        content_type TEXT DEFAULT 'text',
        tags TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    const columns = [
      "ALTER TABLE clips ADD COLUMN source_app TEXT DEFAULT ''",
      "ALTER TABLE clips ADD COLUMN is_sensitive INTEGER DEFAULT 0",
      "ALTER TABLE clips ADD COLUMN content_type TEXT DEFAULT 'text'",
      "ALTER TABLE clips ADD COLUMN tags TEXT DEFAULT ''",
    ];
    for (const sql of columns) {
      try { await database.execute(sql); } catch (_) {}
    }
  };

  const connectToDatabase = async (folderPath: string) => {
    try {
      const dirExists = await exists(folderPath);
      if (!dirExists) {
        await mkdir(folderPath, { recursive: true });
      }
      const dbFilePath = await join(folderPath, "clipboard.db");
      const database = await Database.load(`sqlite:${dbFilePath}`);
      await ensureSchema(database);
      await fetchHistory(database);
      setDb(database);
      setDbPath(folderPath);
      activeSearchRef.current = "";
    } catch (error) {
      console.error("Database connection failed:", error);
      toast.error("Database connection failed. Check your storage settings.");
    }
  };

  const fetchHistory = useCallback(async (database: Database) => {
    try {
      const countRows = await database.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM clips"
      );
      const total = countRows[0]?.count ?? 0;
      setTotalClips(total);

      const rows = await database.select<Clip[]>(
        `SELECT id, content, is_pinned, source_app, is_sensitive, content_type, tags, created_at,
         (SELECT COUNT(*) FROM clips c2 WHERE c2.id <= c1.id) as rank
         FROM clips c1
         ORDER BY is_pinned DESC, id DESC LIMIT 200`
      );
      setHistory(rows);
      if (rows.length > 0) {
        const sorted = [...rows].sort((a, b) => b.id - a.id);
        lastClipRef.current = sorted[0].content;
      }
      await invoke("update_tray_tooltip", { count: total }).catch(() => {});
    } catch (e) {
      console.error("fetchHistory error:", e);
      toast.error("Failed to load clipboard history.");
    }
  }, []);

  const searchClips = useCallback(
    async (query: string) => {
      if (!db) return;
      activeSearchRef.current = query.trim();
      if (!query.trim()) {
        await fetchHistory(db);
        return;
      }
      const currentRequestId = ++searchRequestIdRef.current;
      try {
        const rows = await db.select<Clip[]>(
          `SELECT id, content, is_pinned, source_app, is_sensitive, content_type, tags, created_at,
           (SELECT COUNT(*) FROM clips c2 WHERE c2.id <= c1.id) as rank
           FROM clips c1
           WHERE content LIKE $1
           ORDER BY is_pinned DESC, id DESC LIMIT 200`,
          [`%${query.trim()}%`],
        );
        if (currentRequestId === searchRequestIdRef.current) {
          setHistory(rows);
        }
      } catch (e) {
        console.error("Search failed:", e);
        toast.error("Search failed.");
      }
    },
    [db, fetchHistory],
  );

  const addClip = useCallback(
    async (text: string, sourceApp: string = "") => {
      if (!db || !text || text === lastClipRef.current) return;
      try {
        lastClipRef.current = text;

        let isSensitive = 0;
        if (settingsRef.current.detect_sensitive) {
          try {
            const detection = detectSensitiveData(text);
            isSensitive = detection.isSensitive ? 1 : 0;
          } catch (_) {}
        }

        await db.execute(
          `INSERT INTO clips (content, source_app, is_sensitive) VALUES ($1, $2, $3)
           ON CONFLICT(content) DO UPDATE SET created_at = CURRENT_TIMESTAMP, source_app = $2, is_sensitive = $3`,
          [text, sourceApp, isSensitive],
        );

        await applyAutoCleanup(db);

        if (activeSearchRef.current) {
          await searchClips(activeSearchRef.current);
        } else {
          await fetchHistory(db);
        }
      } catch (e) {
        console.error("addClip error:", e);
        toast.error("Failed to save clip.");
      }
    },
    [db, searchClips, fetchHistory],
  );

  const applyAutoCleanup = async (database: Database) => {
    try {
      const settings = settingsRef.current;
      if (settings.retention_days > 0) {
        await database.execute(
          `DELETE FROM clips WHERE is_pinned = 0 AND created_at < datetime('now', '-${settings.retention_days} days')`
        );
      }
      if (settings.max_history_items > 0) {
        await database.execute(
          `DELETE FROM clips WHERE is_pinned = 0 AND id NOT IN (
            SELECT id FROM clips WHERE is_pinned = 0 ORDER BY id DESC LIMIT ${settings.max_history_items}
          )`
        );
      }
    } catch (e) {
      console.error("Auto-cleanup error:", e);
    }
  };

  const togglePin = useCallback(async (id: number, currentPinStatus: number) => {
    if (!db) return;
    try {
      const newStatus = currentPinStatus === 1 ? 0 : 1;
      setHistory((prev) =>
        [...prev]
          .map((c) => (c.id === id ? { ...c, is_pinned: newStatus } : c))
          .sort((a, b) => b.is_pinned - a.is_pinned || b.id - a.id),
      );
      await db.execute("UPDATE clips SET is_pinned = $1 WHERE id = $2", [newStatus, id]);
      toast.success(newStatus === 1 ? "Clip Pinned" : "Pin Removed");
      if (activeSearchRef.current) { await searchClips(activeSearchRef.current); }
      else { await fetchHistory(db); }
    } catch (e) {
      toast.error("Failed to update pin status.");
      if (activeSearchRef.current) { await searchClips(activeSearchRef.current); }
      else { await fetchHistory(db); }
    }
  }, [db, searchClips, fetchHistory]);

  const deleteClip = useCallback(async (id: number) => {
    if (!db) return;
    try {
      setHistory((prev) => prev.filter((c) => c.id !== id));
      await db.execute("DELETE FROM clips WHERE id = $1", [id]);
      toast.success("Clip deleted.");
      if (activeSearchRef.current) { await searchClips(activeSearchRef.current); }
      else { await fetchHistory(db); }
    } catch (e) {
      toast.error("Failed to delete clip.");
      if (activeSearchRef.current) { await searchClips(activeSearchRef.current); }
      else { await fetchHistory(db); }
    }
  }, [db, searchClips, fetchHistory]);

  const deleteByRange = useCallback(async (range: "day" | "week" | "month") => {
    if (!db) return;
    try {
      const modifier = range === "day" ? "-1 day" : range === "week" ? "-7 days" : "-1 month";
      await db.execute(
        `DELETE FROM clips WHERE is_pinned = 0 AND created_at < datetime('now', '${modifier}')`
      );
      activeSearchRef.current = "";
      await fetchHistory(db);
      toast.success(`Cleared unpinned clips older than a ${range}.`);
    } catch (e) {
      console.error("deleteByRange error:", e);
      toast.error("Failed to clear history by range.");
    }
  }, [db, fetchHistory]);

  const clearAllHistory = useCallback(async () => {
    if (!db) return;
    try {
      await db.execute("DELETE FROM clips WHERE is_pinned = 0");
      activeSearchRef.current = "";
      await fetchHistory(db);
      toast.success("All unpinned clips cleared.");
    } catch (e) {
      console.error("clearAllHistory error:", e);
      toast.error("Failed to clear history.");
    }
  }, [db, fetchHistory]);

  const updateClipContent = useCallback(async (id: number, newContent: string) => {
    if (!db) return;
    try {
      await db.execute("UPDATE clips SET content = $1 WHERE id = $2", [newContent, id]);
      if (activeSearchRef.current) { await searchClips(activeSearchRef.current); }
      else { await fetchHistory(db); }
      toast.success("Clip updated.");
    } catch (e) {
      toast.error("Failed to update clip.");
    }
  }, [db, searchClips, fetchHistory]);

  const smartPaste = useCallback(async (clip: Clip) => {
    try {
      await writeText(clip.content);
      lastClipRef.current = clip.content;
      await invoke("smart_paste");
    } catch (e) {
      console.error("Smart paste failed:", e);
      toast.error("Smart paste failed. Try copying manually.");
    }
  }, []);

  const copyAndHide = useCallback(async (clip: Clip) => {
    try {
      await writeText(clip.content);
      lastClipRef.current = clip.content;
      await invoke("smart_paste");
    } catch (e) {
      console.error("Copy-and-hide failed:", e);
      toast.error("Copy failed. Please try again.");
    }
  }, []);

  // JS-side clipboard polling fallback
  useEffect(() => {
    if (!db) return;
    const interval = setInterval(async () => {
      try {
        const text = await readText();
        if (text && text !== lastClipRef.current) {
          let sourceApp = "";
          try { sourceApp = await invoke<string>("get_frontmost_app"); } catch (_) {}
          if (sourceApp && isExcludedApp(sourceApp, settingsRef.current.excluded_apps)) {
            lastClipRef.current = text;
            return;
          }
          await addClip(text, sourceApp);
        }
      } catch (_) {}
    }, 500);
    return () => clearInterval(interval);
  }, [db, addClip]);

  // Rust-side clipboard event listener
  useEffect(() => {
    const unlisten = listen<string>("clipboard-change", async (event) => {
      const text = event.payload;
      if (!text || text === lastClipRef.current) return;
      let sourceApp = "";
      try { sourceApp = await invoke<string>("get_frontmost_app"); } catch (_) {}
      if (sourceApp && isExcludedApp(sourceApp, settingsRef.current.excluded_apps)) {
        lastClipRef.current = text;
        return;
      }
      if (dbRef.current) {
        await addClip(text, sourceApp);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [addClip]);

  // Tray event listeners
  useEffect(() => {
    const unlisten1 = listen("open-settings", () => {
      window.dispatchEvent(new CustomEvent("navigate-settings"));
    });
    const unlisten2 = listen("tray-clear-unpinned", () => {
      window.dispatchEvent(new CustomEvent("tray-clear-unpinned"));
    });
    return () => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    };
  }, []);

  return {
    history, dbPath, isInitializing, totalClips,
    connectToDatabase, addClip, togglePin, deleteClip,
    deleteByRange, clearAllHistory, searchClips,
    smartPaste, copyAndHide, updateClipContent,
  };
}
