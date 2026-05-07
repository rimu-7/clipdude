import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Pin, Inbox } from "lucide-react";
import { Toaster } from "sonner";

import { useClipboard } from "./hooks/useClipboard";
import Navbar from "./components/Navbar";
import GroupAccordion from "./components/GroupAccordion";
import SettingsPage from "./pages/Settings";

// Shadcn UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

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
    searchClips,
    togglePin,
  } = useClipboard();

  const [isDark, setIsDark] = useState(true);
  const [openBatch, setOpenBatch] = useState<string | null>("pinned"); // Open pinned by default
  const [activeTab, setActiveTab] = useState<"monitor" | "settings">("monitor");

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

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
    setIsDark(!isDark);
    const store = await load("settings.json", {
      autoSave: true,
      defaults: {},
    } as any);
    await store.set("dark_mode", !isDark);
  };

  // --- ROBUST DEBOUNCED SEARCH ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      searchClips(searchQuery);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
    // Explicitly omitting searchClips from dependencies to prevent infinite loop risks
    // if the custom hook doesn't wrap it in useCallback.
  }, [searchQuery]);

  // Handle Accordion state synchronization
  useEffect(() => {
    if (debouncedQuery.trim().length > 0) {
      setOpenBatch("search-results");
    } else if (openBatch === "search-results") {
      setOpenBatch("pinned");
    }
  }, [debouncedQuery]);

  // --- DATA SEPARATION ---
  const { pinnedClips, groupedClips, isSearching } = useMemo(() => {
    // Use the debounced query to determine layout mode, preventing UI flash
    const isSearchActive = debouncedQuery.trim().length > 0;

    if (isSearchActive) {
      return {
        pinnedClips: [],
        groupedClips: [history], // Single flat list for search results
        isSearching: true,
      };
    }

    // Default behavior (No active search)
    const pinned = history.filter((c) => c.is_pinned === 1);
    const unpinned = history.filter((c) => c.is_pinned !== 1);

    const groups = [];
    for (let i = 0; i < unpinned.length; i += 20) {
      groups.push(unpinned.slice(i, i + 20));
    }

    return {
      pinnedClips: pinned,
      groupedClips: groups,
      isSearching: false,
    };
  }, [history, debouncedQuery]);

  // --- GUARDS ---
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-xs uppercase text-muted-foreground animate-pulse">
        Loading Core Engine...
      </div>
    );
  }

  if (!dbPath) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-black italic tracking-tighter text-primary">
            CLIPDUDE.
          </h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-widest">
            Clipboard Manager
          </p>
        </div>
        <Button
          size="lg"
          variant="outline"
          className="border-2 border-primary uppercase tracking-widest font-bold hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-none shadow-none"
          onClick={async () => {
            const selected = await open({ directory: true, multiple: false });
            if (typeof selected === "string") {
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

  return (
    <div className="min-h-screen rounded-2xl bg-background space-y-6 text-foreground transition-colors duration-300 selection:bg-primary/20">
      <Toaster
        theme={isDark ? "dark" : "light"}
        closeButton
        richColors
        toastOptions={{
          className:
            "border-2 border-border font-mono uppercase text-xs tracking-wider rounded-none shadow-none",
        }}
      />

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <Navbar
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenSettings={() =>
            setActiveTab(activeTab === "settings" ? "monitor" : "settings")
          }
          currentPath={activeTab}
        />

        <main className="mt-8">
          <AnimatePresence mode="wait">
            {activeTab === "monitor" ? (
              <motion.div
                key="monitor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* SEARCH BAR */}
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    type="text"
                    placeholder="Search clips..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 w-ful rounded-3xl border bg-card/70 backdrop-blur pl-11 pr-11 text-sm transition-all focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSearchQuery("");
                        setDebouncedQuery("");
                        searchClips("");
                      }}
                      className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* PINNED ACCORDION */}
                {!isSearching && pinnedClips.length > 0 && (
                  <div className="">
                    <GroupAccordion
                      title="Pinned Clips"
                      icon={
                        <Pin className="w-4 h-4 fill-primary text-primary" />
                      }
                      group={pinnedClips}
                      onInternalCopy={addClip}
                      onDelete={deleteClip}
                      onTogglePin={togglePin}
                      isOpen={openBatch === "pinned"}
                      onToggle={() =>
                        setOpenBatch((prev) =>
                          prev === "pinned" ? null : "pinned",
                        )
                      }
                    />
                  </div>
                )}

                {/* HISTORY / SEARCH RESULTS */}
                {groupedClips.length > 0 && groupedClips[0].length > 0
                  ? groupedClips.map((group, idx) => {
                      const batchId = isSearching
                        ? "search-results"
                        : `batch-${idx}`;
                      const title = isSearching
                        ? `Search Results (${group.length})`
                        : `Batch ${idx + 1}`;

                      return (
                        <div key={batchId} className="rounded-none shadow-none">
                          <GroupAccordion
                            title={title}
                            group={group}
                            onInternalCopy={addClip}
                            onDelete={deleteClip}
                            onTogglePin={togglePin}
                            isOpen={openBatch === batchId}
                            onToggle={() =>
                              setOpenBatch((prev) =>
                                prev === batchId ? null : batchId,
                              )
                            }
                          />
                        </div>
                      );
                    })
                  : /* EMPTY STATE */
                    !pinnedClips.length && (
                      <Card className="border-dashed border-2 bg-transparent rounded-none shadow-none">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
                          <Inbox className="h-8 w-8 opacity-50" />
                          <p className="uppercase text-[10px] font-bold tracking-[0.2em] text-center">
                            {isSearching
                              ? "No matching clips found."
                              : "Listening for clipboard activity..."}
                          </p>
                        </CardContent>
                      </Card>
                    )}
              </motion.div>
            ) : (
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
                    const store = await load("settings.json", {
                      autoSave: true,
                      defaults: {},
                    } as any);
                    await store.clear();
                    window.location.reload();
                  }}
                  onSelectFolder={async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                    });
                    if (typeof selected === "string")
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
