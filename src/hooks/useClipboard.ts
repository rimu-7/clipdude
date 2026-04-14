import { useEffect, useState, useRef } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import Database from "@tauri-apps/plugin-sql";
import { join } from "@tauri-apps/api/path";
import { load } from "@tauri-apps/plugin-store";
import { Clip } from "../types";

export function useClipboard() {
  const [db, setDb] = useState<Database | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const lastClipRef = useRef<string>("");

  // 1. Initial Setup
  useEffect(() => {
    async function setup() {
      try {
        const store = await load("settings.json", { autoSave: true });
        const savedFolder = await store.get<{ path: string }>("db_folder");
        if (savedFolder?.path) await connectToDatabase(savedFolder.path);
      } catch (e) {
        console.error("Initialization failed", e);
      } finally {
        setIsInitializing(false);
      }
    }
    setup();
  }, []);

  // 2. Database Connection
  const connectToDatabase = async (folderPath: string) => {
    const dbFilePath = await join(folderPath, "clipboard.db");
    const database = await Database.load(`sqlite:${dbFilePath}`);
    
    await database.execute(
      `CREATE TABLE IF NOT EXISTS clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        content TEXT UNIQUE, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );

    const rows = await database.select<Clip[]>("SELECT id, content, created_at FROM clips ORDER BY id DESC LIMIT 200");
    setHistory(rows);
    if (rows.length > 0) lastClipRef.current = rows[0].content;
    setDb(database);
    setDbPath(folderPath);
  };

  // 3. Core Actions
  const addClip = async (text: string) => {
    if (!db || !text || text === lastClipRef.current) return;
    try {
      lastClipRef.current = text;
      await db.execute("INSERT OR IGNORE INTO clips (content) VALUES ($1)", [text]);
      const rows = await db.select<Clip[]>("SELECT id, content FROM clips ORDER BY id DESC LIMIT 200");
      setHistory(rows);
    } catch (e) {}
  };

  const deleteClip = async (id: number) => {
    if (!db) return;
    await db.execute("DELETE FROM clips WHERE id = $1", [id]);
    setHistory(prev => prev.filter(c => c.id !== id));
  };

  const deleteByRange = async (range: 'day' | 'week' | 'month') => {
    if (!db) return;
    const modifier = range === 'day' ? '-1 day' : range === 'week' ? '-7 days' : '-1 month';
    await db.execute(`DELETE FROM clips WHERE created_at < datetime('now', $1)`, [modifier]);
    const rows = await db.select<Clip[]>("SELECT id, content FROM clips ORDER BY id DESC LIMIT 200");
    setHistory(rows);
  };

  const clearAllHistory = async () => {
    if (!db) return;
    await db.execute("DELETE FROM clips");
    setHistory([]);
    lastClipRef.current = "";
  };

  // 4. Live Monitor (200ms Engine)
  useEffect(() => {
    if (!db) return;
    const interval = setInterval(async () => {
      try {
        const text = await readText();
        if (text && text !== lastClipRef.current) await addClip(text);
      } catch (e) {}
    }, 200);
    return () => clearInterval(interval);
  }, [db]);

  return {
    history,
    dbPath,
    isInitializing,
    connectToDatabase,
    addClip,
    deleteClip,
    deleteByRange,
    clearAllHistory
  };
}