import { useEffect, useState, useMemo, useRef } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import Database from "@tauri-apps/plugin-sql";
import { join } from "@tauri-apps/api/path";
import { AnimatePresence, motion } from "framer-motion";

// Modular Imports
import Navbar from "./components/Navbar";
import GroupAccordion from "./components/GroupAccordion";
import Settings from "./pages/Settings";

export interface Clip {
    id: number;
    content: string;
    created_at?: string;
}

export default function App() {
    const [db, setDb] = useState<Database | null>(null);
    const [history, setHistory] = useState<Clip[]>([]);
    const [isDark, setIsDark] = useState(true);
    const [dbPath, setDbPath] = useState<string | null>(null);
    const [view, setView] = useState<"monitor" | "settings">("monitor");
    const [isInitializing, setIsInitializing] = useState(true);
    const lastClipRef = useRef<string>("");

    useEffect(() => {
        const root = window.document.documentElement;
        if (isDark) {
            root.classList.add("dark");
            root.style.colorScheme = "dark";
        } else {
            root.classList.remove("dark");
            root.style.colorScheme = "light";
        }
    }, [isDark]);

    const groupedHistory = useMemo(() => {
        const groups = [];
        for (let i = 0; i < history.length; i += 20) {
            groups.push(history.slice(i, i + 20));
        }
        return groups;
    }, [history]);

    useEffect(() => {
        async function setup() {
            const store = await load("settings.json", { autoSave: true });
            const savedFolder = await store.get<{ path: string }>("db_folder");
            const savedTheme = await store.get<boolean>("dark_mode");
            if (savedTheme !== null) setIsDark(savedTheme);
            if (savedFolder?.path) await connectToDatabase(savedFolder.path);
            setIsInitializing(false);
        }
        setup();
    }, []);

    async function connectToDatabase(folderPath: string) {
        const dbFilePath = await join(folderPath, "clipboard.db");
        const database = await Database.load(`sqlite:${dbFilePath}`);
        await database.execute(
            "CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
        );
        const rows = await database.select<Clip[]>(
            "SELECT id, content, created_at FROM clips ORDER BY id DESC LIMIT 200",
        );
        setHistory(rows);
        if (rows.length > 0) lastClipRef.current = rows[0].content;
        setDb(database);
        setDbPath(folderPath);
    }

    const addClip = async (text: string) => {
        if (!db || !text || text === lastClipRef.current) return;
        try {
            lastClipRef.current = text;
            await db.execute(
                "INSERT OR IGNORE INTO clips (content) VALUES ($1)",
                [text],
            );
            const rows = await db.select<Clip[]>(
                "SELECT id, content, created_at FROM clips ORDER BY id DESC LIMIT 200",
            );
            setHistory(rows);
        } catch (e) {
            console.error("Failed to add clip", e);
        }
    };

    useEffect(() => {
        if (!db) return;
        const interval = setInterval(async () => {
            try {
                const text = await readText();
                if (text && text !== lastClipRef.current) await addClip(text);
            } catch (e) {
                // Ignore read errors
            }
        }, 200);
        return () => clearInterval(interval);
    }, [db]);

    const toggleTheme = async () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        const store = await load("settings.json", { autoSave: true });
        await store.set("dark_mode", newTheme);
    };

    const deleteByRange = async (range: "day" | "week" | "month") => {
        if (!db) return;
        const modifier =
            range === "day"
                ? "-1 day"
                : range === "week"
                  ? "-7 days"
                  : "-1 month";

        try {
            await db.execute(
                `DELETE FROM clips WHERE created_at < datetime('now', $1)`,
                [modifier],
            );
            const rows = await db.select<Clip[]>(
                "SELECT id, content, created_at FROM clips ORDER BY id DESC LIMIT 200",
            );
            setHistory(rows);
        } catch (e) {
            console.error("Range delete failed:", e);
        }
    };

    const deleteClip = async (id: number) => {
        if (!db) return;
        await db.execute("DELETE FROM clips WHERE id = $1", [id]);
        setHistory((prev) => prev.filter((c) => c.id !== id));
    };

    const clearAllHistory = async () => {
        if (!db) return;
        await db.execute("DELETE FROM clips");
        setHistory([]);
        lastClipRef.current = "";
    };

    const resetApp = async () => {
        const store = await load("settings.json", { autoSave: true });
        await store.clear();
        window.location.reload();
    };

    if (isInitializing)
        return (
            <div className="h-screen flex items-center justify-center text-emerald-500 font-mono tracking-widest">
                INITIALIZING...
            </div>
        );

    return (
        <div className="min-h-screen transition-colors duration-300 text-zinc-900 dark:text-zinc-100 selection:bg-emerald-500 selection:text-white">
            <div className="max-w-2xl mx-auto p-6">
                <Navbar
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                    onOpenSettings={() =>
                        setView(view === "settings" ? "monitor" : "settings")
                    }
                    currentPath={view}
                />

                <AnimatePresence mode="wait">
                    {view === "monitor" ? (
                        <motion.div
                            key="monitor"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-8"
                        >
                            {groupedHistory.map((group, idx) => (
                                <GroupAccordion
                                    key={idx}
                                    group={group}
                                    groupIndex={idx}
                                    totalHistoryLength={history.length}
                                    onInternalCopy={addClip}
                                    onDeleteClip={deleteClip}
                                />
                            ))}
                            {history.length === 0 && (
                                <div className="text-center py-20 text-zinc-400 font-mono text-sm">
                                    No clipboard history yet. Start copying!
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <Settings
                            key="settings"
                            dbPath={dbPath}
                            onSelectFolder={async () => {
                                const selected = await open({
                                    directory: true,
                                    multiple: false,
                                });
                                if (selected && typeof selected === "string") {
                                    const store = await load("settings.json", {
                                        autoSave: true,
                                    });
                                    await store.set("db_folder", {
                                        path: selected,
                                    });
                                    connectToDatabase(selected);
                                }
                            }}
                            onBack={() => setView("monitor")}
                            onClearHistory={clearAllHistory}
                            onResetApp={resetApp}
                            onDeleteRange={deleteByRange}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
