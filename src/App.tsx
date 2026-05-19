import { useEffect, useMemo, useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { AnimatePresence, motion } from "framer-motion";
import Fuse from "fuse.js";
import { Search, X, Pin, Inbox } from "lucide-react";
import { Toaster, toast } from "sonner";

import { useClipboard } from "./hooks/useClipboard";
import Sidebar from "./components/Sidebar.tsx";
import GroupAccordion from "./components/GroupAccordion";
import SettingsPage from "./pages/Settings";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { type Clip } from "./types";

export type ViewMode = "all" | "pinned" | "settings";

export default function App() {
  const {
    history, dbPath, isInitializing,
    connectToDatabase, addClip, deleteClip,
    deleteByRange, clearAllHistory, searchClips,
    togglePin, copyAndHide, updateClipContent,
  } = useClipboard();

  const [isDark, setIsDark] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [openBatch, setOpenBatch] = useState<string | null>("pinned");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stats, setStats] = useState({ total: 0, pinned: 0 });
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const store = await load("settings.json", { autoSave: true, defaults: {} } as any);
        const saved = await store.get<boolean>("dark_mode");
        if (typeof saved === "boolean") setIsDark(saved);
      } catch (e) {
        console.error("Failed to load theme:", e);
      }
    })();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);

  const toggleTheme = useCallback(async () => {
    const next = !isDark;
    setIsDark(next);
    try {
      const store = await load("settings.json", { autoSave: true, defaults: {} } as any);
      await store.set("dark_mode", next);
    } catch (e) {
      console.error("Failed to save theme:", e);
    }
  }, [isDark]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Search clips..."]')?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      searchClips(searchQuery);
    }, 200);
    return () => clearTimeout(id);
  }, [searchQuery, searchClips]);

  useEffect(() => {
    if (debouncedQuery.trim().length > 0) {
      setOpenBatch("search-results");
    } else if (openBatch === "search-results") {
      setOpenBatch(viewMode === "pinned" ? "pinned-only" : "pinned");
    }
  }, [debouncedQuery, openBatch, viewMode]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setStats({
        total: history.length,
        pinned: history.filter((c) => c.is_pinned === 1).length,
      });
    }
  }, [history, debouncedQuery]);

  const fuse = useMemo(
    () => new Fuse(history, {
      keys: ["content"],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    }),
    [history]
  );

  const fusedResults = useMemo(() => {
    if (!debouncedQuery.trim()) return history;
    return fuse.search(debouncedQuery).map((r) => r.item);
  }, [debouncedQuery, fuse, history]);

  const displayData = useMemo(() => {
    const searching = debouncedQuery.trim().length > 0;
    const data = searching ? fusedResults : history;

    if (searching) {
      return {
        pinnedSection: null as null,
        batches: [{ id: "search-results", clips: data, label: "Results", icon: <Search className="w-4 h-4" /> }],
        isEmpty: data.length === 0,
        emptyMessage: "No matching clips found.",
      };
    }

    if (viewMode === "pinned") {
      const pinned = data.filter((c) => c.is_pinned === 1);
      return {
        pinnedSection: pinned.length ? { id: "pinned-only" as const, clips: pinned } : null,
        batches: [] as any[],
        isEmpty: pinned.length === 0,
        emptyMessage: "No pinned clips yet.",
      };
    }

    const pinned = data.filter((c) => c.is_pinned === 1);
    const unpinned = data.filter((c) => c.is_pinned !== 1);

    const batches: Array<{ id: string; clips: Clip[]; label: string; icon?: React.ReactNode }> = [];
    for (let i = 0; i < unpinned.length; i += 20) {
      const end = Math.min(i + 20, unpinned.length);
      const batchClips = unpinned.slice(i, end);
      const minRank = Math.min(...batchClips.map((c) => c.rank || c.id));
      const maxRank = Math.max(...batchClips.map((c) => c.rank || c.id));
      batches.push({ id: `batch-${Math.floor(i / 20)}`, clips: batchClips, label: `${minRank} — ${maxRank}` });
    }

    return {
      pinnedSection: pinned.length ? { id: "pinned" as const, clips: pinned } : null,
      batches,
      isEmpty: pinned.length === 0 && unpinned.length === 0,
      emptyMessage: "Listening for clipboard activity...",
    };
  }, [history, fusedResults, debouncedQuery, viewMode]);

  const handleViewChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      setSearchQuery("");
      setDebouncedQuery("");
      searchClips("");
      if (mode === "all") setOpenBatch("pinned");
      else if (mode === "pinned") setOpenBatch("pinned-only");
    },
    [searchClips]
  );

  useEffect(() => {
    const handler = () => handleViewChange("settings");
    window.addEventListener("navigate-settings", handler);
    return () => window.removeEventListener("navigate-settings", handler);
  }, [handleViewChange]);

  useEffect(() => {
    const handler = () => {
      clearAllHistory();
    };
    window.addEventListener("tray-clear-unpinned", handler);
    return () => window.removeEventListener("tray-clear-unpinned", handler);
  }, [clearAllHistory]);

  const handleTransform = useCallback(
    async (clip: Clip, transformed: string) => {
      await updateClipContent(clip.id, transformed);
    },
    [updateClipContent]
  );

  const handleClearAll = useCallback(async () => {
    if (clearConfirm) {
      await clearAllHistory();
      setClearConfirm(false);
    } else {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
    }
  }, [clearConfirm, clearAllHistory]);

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-xs uppercase text-muted-foreground animate-pulse">
        Loading ClipDude...
      </div>
    );
  }

  if (!dbPath) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-black italic tracking-tighter text-primary">CLIPDUDE.</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-widest">Clipboard Manager</p>
        </div>
        <Button
          size="lg"
          variant="outline"
          className="border-2 border-primary uppercase tracking-widest font-bold hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-2xl"
          onClick={async () => {
            try {
              const selected = await open({ directory: true, multiple: false });
              if (typeof selected === "string") {
                const store = await load("settings.json", { autoSave: true, defaults: {} } as any);
                await store.set("db_folder", selected);
                await connectToDatabase(selected);
              }
            } catch (e) {
              toast.error("Folder selection failed.");
            }
          }}
        >
          Select Database Folder
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 selection:bg-primary/20">
      <Toaster
        theme={isDark ? "dark" : "light"}
        closeButton
        richColors
        toastOptions={{
          className: "border border-border font-mono uppercase text-xs tracking-wider rounded-xl backdrop-blur-sm",
        }}
      />

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 rounded-full bg-primary/3 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full bg-cyan-500/3 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-500/2 blur-3xl" />
      </div>

      <Sidebar
        viewMode={viewMode}
        onViewChange={handleViewChange}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        totalClips={stats.total}
        pinnedClips={stats.pinned}
        onClearAll={handleClearAll}
        clearConfirm={clearConfirm}
      />

      <div className="lg:ml-56 min-h-screen transition-[margin] duration-300">
        <div className="mx-auto max-w-3xl px-4 pt-20 pb-8 sm:px-6 lg:px-8 lg:pt-6">
          <AnimatePresence mode="wait">
            {viewMode === "settings" ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <SettingsPage
                  dbPath={dbPath}
                  onBack={() => handleViewChange("all")}
                  onClearHistory={clearAllHistory}
                  onDeleteRange={deleteByRange}
                  onResetApp={async () => {
                    try {
                      const store = await load("settings.json", { autoSave: true, defaults: {} } as any);
                      await store.clear();
                      window.location.reload();
                    } catch (e) {
                      toast.error("Failed to reset settings.");
                    }
                  }}
                  onSelectFolder={async () => {
                    try {
                      const selected = await open({ directory: true, multiple: false });
                      if (typeof selected === "string") connectToDatabase(selected);
                    } catch (e) {
                      toast.error("Folder selection failed.");
                    }
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3"
              >
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    type="text"
                    placeholder="Search clips..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm pl-11 pr-11 text-sm transition-all focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary shadow-none placeholder:text-muted-foreground/60"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setSearchQuery(""); setDebouncedQuery(""); searchClips(""); }}
                      className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors rounded-xl"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {displayData.pinnedSection && (
                  <GroupAccordion
                    id={displayData.pinnedSection.id}
                    title="Pinned"
                    icon={<Pin className="w-4 h-4 fill-primary text-primary" />}
                    group={displayData.pinnedSection.clips}
                    onInternalCopy={addClip}
                    onDelete={deleteClip}
                    onTogglePin={togglePin}
                    onCopyAndHide={copyAndHide}
                    onTransform={handleTransform}
                    isOpen={openBatch === displayData.pinnedSection.id}
                    onToggle={() => setOpenBatch((prev) => prev === displayData.pinnedSection!.id ? null : displayData.pinnedSection!.id)}
                  />
                )}

                {displayData.batches.map((batch) => (
                  <GroupAccordion
                    key={batch.id}
                    id={batch.id}
                    title={batch.label}
                    icon={batch.icon}
                    group={batch.clips}
                    onInternalCopy={addClip}
                    onDelete={deleteClip}
                    onTogglePin={togglePin}
                    onCopyAndHide={copyAndHide}
                    onTransform={handleTransform}
                    isOpen={openBatch === batch.id}
                    onToggle={() => setOpenBatch((prev) => prev === batch.id ? null : batch.id)}
                  />
                ))}

                {displayData.isEmpty && (
                  <Card className="border-dashed border-2 bg-transparent shadow-none rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-4">
                      <Inbox className="h-8 w-8 opacity-40" />
                      <p className="uppercase text-[10px] font-bold tracking-[0.2em] text-center leading-relaxed">
                        {displayData.emptyMessage}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
