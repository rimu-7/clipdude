import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { AnimatePresence, motion } from "framer-motion";

// Custom Hooks & Components
import { useClipboard } from "./hooks/useClipboard";
import { Button } from "@/components/ui/button";
import Navbar from "./components/Navbar";
import GroupAccordion from "./components/GroupAccordion";
import SettingsPage from "./pages/Settings";

export default function App() {
    const {
        history,
        dbPath,
        isInitializing,
        connectToDatabase,
        addClip,
        deleteClip,
        deleteByRange,
        clearAllHistory,
    } = useClipboard();

    const [isDark, setIsDark] = useState(true);
    const [openBatch, setOpenBatch] = useState<number | null>(0);

    // THIS is our "Router" now. Simple and unbreakable.
    const [activeTab, setActiveTab] = useState<"monitor" | "settings">(
        "monitor",
    );

    // --- THEME ENGINE ---
    useEffect(() => {
        async function loadTheme() {
            const store = await load("settings.json", {
                autoSave: true,
                defaults: {},
            } as any);
            const savedTheme = await store.get<boolean>("dark_mode");
            if (typeof savedTheme === "boolean") setIsDark(savedTheme);
        }
        loadTheme();
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add("dark");
            root.style.colorScheme = "dark";
        } else {
            root.classList.remove("dark");
            root.style.colorScheme = "light";
        }
    }, [isDark]);

    const toggleTheme = async () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        const store = await load("settings.json", {
            autoSave: true,
            defaults: {},
        } as any);
        await store.set("dark_mode", newTheme);
    };

    // --- COMPACT GROUPING ---
    const groupedHistory = useMemo(() => {
        const groups = [];
        for (let i = 0; i < history.length; i += 20) {
            groups.push(history.slice(i, i + 20));
        }
        return groups;
    }, [history]);

    // 1. Loading Guard
    if (isInitializing) {
        return (
            <div className="h-screen flex items-center justify-center bg-background text-primary animate-pulse font-mono uppercase text-xs">
                Loading Core Engine...
            </div>
        );
    }

    // 2. Onboarding Guard (If no DB, stay here)
    if (!dbPath) {
        return (
            <div className="h-screen flex flex-col items-center justify-center p-6 space-y-6 bg-background text-foreground transition-colors duration-300">
                <div className="text-center space-y-2 mb-8">
                    <h1 className="text-4xl font-black italic tracking-tighter text-primary">
                        CLIPDUDE.
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">
                        Connect a local directory to secure your clipboard
                        history.
                    </p>
                </div>
                <Button
                    size="lg"
                    className="font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-xl h-14 px-10 rounded-2xl bg-primary text-primary-foreground"
                    onClick={async () => {
                        const selected = await open({
                            directory: true,
                            multiple: false,
                        });
                        if (selected && typeof selected === "string") {
                            const store = await load("settings.json", {
                                autoSave: true,
                                defaults: {},
                            } as any);
                            await store.set("db_folder", { path: selected });
                            await connectToDatabase(selected);
                        }
                    }}
                >
                    Select Database Folder
                </Button>
            </div>
        );
    }

    // 3. Main Application
    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300 selection:bg-primary/20">
            <div className="max-w-2xl mx-auto p-6 pb-20">
                {/* Navbar handles the toggling */}
                <Navbar
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                    onOpenSettings={() =>
                        setActiveTab(
                            activeTab === "settings" ? "monitor" : "settings",
                        )
                    }
                    currentPath={activeTab}
                />

                <main className="mt-8">
                    <AnimatePresence mode="wait">
                        {/* VIEW 1: MONITOR */}
                        {activeTab === "monitor" ? (
                            <motion.div
                                key="monitor"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {groupedHistory.length > 0 ? (
                                    groupedHistory.map((group, idx) => (
                                        <GroupAccordion
                                            key={`group-${idx}`}
                                            group={group}
                                            groupIndex={idx}
                                            totalHistoryLength={history.length}
                                            onInternalCopy={addClip}
                                            onDelete={deleteClip}
                                            isOpen={openBatch === idx}
                                            onToggle={() =>
                                                setOpenBatch((prev) =>
                                                    prev === idx ? null : idx,
                                                )
                                            }
                                        />
                                    ))
                                ) : (
                                    <div className="py-24 text-center border-2 border-dashed border-border rounded-3xl text-muted-foreground uppercase text-[10px] font-bold tracking-[0.2em]">
                                        Listening for clipboard activity...
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            /* VIEW 2: SETTINGS */
                            <motion.div
                                key="settings"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <SettingsPage
                                    dbPath={dbPath}
                                    onBack={() => setActiveTab("monitor")}
                                    onClearHistory={clearAllHistory}
                                    onDeleteRange={deleteByRange}
                                    onResetApp={async () => {
                                        const store = await load(
                                            "settings.json",
                                            {
                                                autoSave: true,
                                                defaults: {},
                                            } as any,
                                        );
                                        await store.clear();
                                        window.location.reload();
                                    }}
                                    onSelectFolder={async () => {
                                        const selected = await open({
                                            directory: true,
                                            multiple: false,
                                        });
                                        if (
                                            selected &&
                                            typeof selected === "string"
                                        )
                                            connectToDatabase(selected);
                                    }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
