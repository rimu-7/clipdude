import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Pin, Inbox } from "lucide-react";
import { Toaster, toast } from "sonner";

import { useClipboard } from "./hooks/useClipboard";
import { useConfirm } from "./hooks/useConfirm";
import { useUpdates } from "./hooks/useUpdates";
import Sidebar from "./components/Sidebar";
import GroupAccordion from "./components/GroupAccordion";
import SettingsPage from "./pages/Settings";
import UpdateDialog from "./components/UpdateDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api, errorMessage, formatShortcut } from "@/lib/api";
import type { AppSettings, Bootstrap, Clip, ViewMode } from "./types";

const BATCH_SIZE = 20;

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    api
      .bootstrap()
      .then((data) => {
        setBoot(data);
        setSettings(data.settings);
        if (data.database.available && data.database.warning) {
          toast.warning(data.database.warning, { duration: 12000 });
        }
      })
      .catch((error) => setBootError(errorMessage(error)));
  }, []);

  // The window stays hidden until the first real frame, so it never flashes blank.
  useEffect(() => {
    if (!boot && !bootError) return;
    requestAnimationFrame(() => api.frontendReady().catch(() => {}));
  }, [boot, bootError]);

  useEffect(() => {
    const dark = settings?.dark_mode ?? true;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [settings?.dark_mode]);

  // The tray menu can change settings too.
  useEffect(() => {
    const unlisten = listen<AppSettings>("settings-changed", (event) => setSettings(event.payload));
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const changeSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const previous = settingsRef.current;
    if (previous) setSettings({ ...previous, ...patch });
    try {
      setSettings(await api.updateSettings(patch));
      return true;
    } catch (error) {
      if (previous) setSettings(previous);
      toast.error(errorMessage(error));
      return false;
    }
  }, []);

  const isDark = settings?.dark_mode ?? true;

  return (
    <>
      <Toaster
        theme={isDark ? "dark" : "light"}
        closeButton
        richColors
        toastOptions={{ className: "border border-border font-mono text-xs rounded-xl" }}
      />
      {bootError ? (
        <FullScreenMessage title="ClipDude could not start" detail={bootError}>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </FullScreenMessage>
      ) : !boot || !settings ? (
        <div className="h-screen bg-background" />
      ) : !boot.database.available ? (
        <DatabaseUnavailable
          detail={boot.database.warning ?? "The database could not be opened."}
          onRecovered={(database) => setBoot({ ...boot, database })}
        />
      ) : (
        <Home boot={boot} settings={settings} onSettingsChange={changeSettings} />
      )}
    </>
  );
}

function FullScreenMessage({
  title, detail, children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-6 bg-background text-foreground">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-black italic tracking-tighter text-primary">CLIPDUDE.</h1>
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-lg break-words text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

function DatabaseUnavailable({
  detail, onRecovered,
}: {
  detail: string;
  onRecovered: (database: Bootstrap["database"]) => void;
}) {
  const attempt = async (action: () => Promise<Bootstrap["database"]>) => {
    try {
      const database = await action();
      if (database.available) onRecovered(database);
      else toast.error(database.warning ?? "The database is still unavailable.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <FullScreenMessage title="Your clipboard database could not be opened" detail={detail}>
      <Button onClick={() => attempt(api.retryDatabase)}>Retry</Button>
      <Button variant="outline" onClick={() => attempt(async () => (await api.setDatabaseFolder(null)).database)}>
        Use Default Location
      </Button>
      <Button
        variant="ghost"
        onClick={() =>
          attempt(async () => {
            const folder = await open({ directory: true, multiple: false });
            if (typeof folder !== "string") return api.databaseInfo();
            return (await api.setDatabaseFolder(folder)).database;
          })
        }
      >
        Choose Folder…
      </Button>
    </FullScreenMessage>
  );
}

interface Section {
  id: string;
  title: string;
  icon?: React.ReactNode;
  clips: Clip[];
  startIndex?: number;
}

function Home({
  boot, settings, onSettingsChange,
}: {
  boot: Bootstrap;
  settings: AppSettings;
  onSettingsChange: (patch: Partial<AppSettings>) => Promise<boolean>;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // `undefined` means "open the first section automatically".
  const [openSection, setOpenSection] = useState<string | null | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();
  const updates = useUpdates(boot.update);
  const [updateOpen, setUpdateOpen] = useState(false);

  const history = useClipboard(viewMode === "pinned" ? "pinned" : "all", debouncedQuery, settings.smart_paste);
  const searching = debouncedQuery.trim().length > 0;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => setOpenSection(undefined), [viewMode, debouncedQuery]);

  const focusSearch = useCallback((select = false) => {
    const input = searchRef.current;
    if (!input) return;
    input.focus();
    if (select) input.select();
  }, []);

  const changeView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  const updatePhaseRef = useRef(updates.status.phase);
  updatePhaseRef.current = updates.status.phase;

  /** Opens the update dialog, checking first when no update is known yet. */
  const openUpdate = useCallback(() => {
    setUpdateOpen(true);
    if (!["available", "downloading", "installing"].includes(updatePhaseRef.current)) {
      updates.check();
    }
  }, [updates.check]);

  const checkUpdatesNow = useCallback(async () => {
    const result = await updates.check();
    if (!result) return;
    if (result.phase === "available") setUpdateOpen(true);
    else if (result.phase === "up_to_date") toast.success(`ClipDude ${result.current_version} is up to date`);
    else if (result.phase === "error") toast.error(result.error ?? "Could not check for updates.");
  }, [updates.check]);

  const skipUpdate = useCallback(
    async (version: string) => {
      setUpdateOpen(false);
      if (await onSettingsChange({ skipped_update_version: version })) {
        toast.info(`You won't be reminded about ${version}. You can still install it from Settings.`);
      }
    },
    [onSettingsChange],
  );

  useEffect(() => {
    const unlistenShown = listen("window-shown", () => focusSearch(true));
    const unlistenSettings = listen("open-settings", () => changeView("settings"));
    const unlistenUpdate = listen("open-update", openUpdate);
    return () => {
      unlistenShown.then((stop) => stop());
      unlistenSettings.then((stop) => stop());
      unlistenUpdate.then((stop) => stop());
    };
  }, [focusSearch, changeView, openUpdate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=alertdialog]") || updateOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (viewMode === "settings") changeView("all");
        requestAnimationFrame(() => focusSearch(true));
      } else if (mod && e.key === ",") {
        e.preventDefault();
        changeView("settings");
      } else if (e.key === "Escape") {
        if (searchQuery) setSearchQuery("");
        else api.hideWindow();
      } else if (!mod && !e.altKey && !typing && e.key.length === 1 && viewMode !== "settings") {
        // Start typing anywhere to search.
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, searchQuery, focusSearch, changeView, updateOpen]);

  const clearUnpinned = useCallback(async () => {
    const ok = await confirm({
      title: "Clear unpinned history?",
      description: "All unpinned clips will be permanently deleted. Pinned clips are kept.",
      confirmLabel: "Clear History",
      destructive: true,
    });
    if (!ok) return;
    try {
      const removed = await api.clearHistory(false);
      toast.success(removed > 0 ? `Deleted ${removed.toLocaleString()} clips` : "History was already empty");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [confirm]);

  const sections = useMemo<Section[]>(() => {
    if (searching) {
      return [{ id: "results", title: "Results", icon: <Search className="w-4 h-4" />, clips: history.clips, startIndex: 1 }];
    }
    const pinned = history.clips.filter((clip) => clip.is_pinned);
    const result: Section[] = [];
    if (pinned.length) {
      result.push({ id: "pinned", title: "Pinned", icon: <Pin className="w-4 h-4 fill-primary text-primary" />, clips: pinned });
    }
    if (viewMode === "all") {
      const unpinned = history.clips.filter((clip) => !clip.is_pinned);
      for (let i = 0; i < unpinned.length; i += BATCH_SIZE) {
        const clips = unpinned.slice(i, i + BATCH_SIZE);
        result.push({ id: `batch-${i / BATCH_SIZE}`, title: `${i + 1} — ${i + clips.length}`, clips, startIndex: i + 1 });
      }
    }
    return result;
  }, [history.clips, searching, viewMode]);

  const openId = openSection === undefined ? (sections[0]?.id ?? null) : openSection;

  const emptyMessage = searching
    ? `No clips match “${debouncedQuery.trim()}”.`
    : viewMode === "pinned"
      ? "No pinned clips yet. Pin a clip to keep it forever."
      : settings.monitor_enabled
        ? "Copy something to get started — ClipDude is listening."
        : "Recording is paused. Resume it from the sidebar to save new copies.";

  const shortcutLabel = formatShortcut(settings.shortcut, boot.platform);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 selection:bg-primary/20">
      {dialog}
      <UpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        status={updates.status}
        onInstall={updates.install}
        onCheck={updates.check}
        onSkip={skipUpdate}
        onOpenReleasePage={updates.openReleasePage}
      />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 rounded-full bg-primary/3 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full bg-cyan-500/3 blur-3xl" />
      </div>

      <Sidebar
        viewMode={viewMode}
        onViewChange={changeView}
        isDark={settings.dark_mode}
        onToggleTheme={() => onSettingsChange({ dark_mode: !settings.dark_mode })}
        stats={history.stats}
        recording={settings.monitor_enabled}
        onToggleRecording={() => onSettingsChange({ monitor_enabled: !settings.monitor_enabled })}
        onClearUnpinned={clearUnpinned}
        shortcutLabel={shortcutLabel}
        update={updates.status}
        skippedUpdateVersion={settings.skipped_update_version}
        onOpenUpdate={openUpdate}
      />

      <main className="ml-56 min-h-screen">
        <div className="mx-auto max-w-3xl px-6 pt-6 pb-8">
          <AnimatePresence mode="wait" initial={false}>
            {viewMode === "settings" ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <SettingsPage
                  settings={settings}
                  platform={boot.platform}
                  version={boot.version}
                  shortcutError={settings.shortcut === boot.settings.shortcut ? boot.shortcut_error : null}
                  onChange={onSettingsChange}
                  onClearUnpinned={clearUnpinned}
                  confirm={confirm}
                  update={updates.status}
                  onCheckUpdates={checkUpdatesNow}
                  onOpenUpdate={openUpdate}
                />
              </motion.div>
            ) : (
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3"
              >
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    ref={searchRef}
                    type="text"
                    autoFocus
                    spellCheck={false}
                    placeholder={`Search ${viewMode === "pinned" ? "pinned clips" : "clips"}…`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm pl-11 pr-11 text-sm transition-all focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary shadow-none placeholder:text-muted-foreground/60"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearchQuery("");
                        focusSearch();
                      }}
                      className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors rounded-xl"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {sections.map((section) => (
                  <GroupAccordion
                    key={section.id}
                    title={section.title}
                    icon={section.icon}
                    clips={section.clips}
                    startIndex={section.startIndex}
                    isOpen={openId === section.id}
                    onToggle={() => setOpenSection(openId === section.id ? null : section.id)}
                    smartPaste={settings.smart_paste}
                    showSourceApp={settings.show_source_app}
                    onActivate={history.activate}
                    onCopy={history.copy}
                    onTogglePin={history.togglePin}
                    onDelete={history.remove}
                    onTransform={history.transform}
                  />
                ))}

                {history.hasMore && (
                  <Button variant="outline" className="w-full rounded-2xl" onClick={history.loadMore}>
                    Load More
                  </Button>
                )}

                {!history.loading && sections.length === 0 && (
                  <Card className="border-dashed border-2 bg-transparent shadow-none rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-4">
                      <Inbox className="h-8 w-8 opacity-40" />
                      <p className="text-xs text-center leading-relaxed max-w-sm">{emptyMessage}</p>
                      {!searching && viewMode === "all" && (
                        <p className="text-[11px] font-mono opacity-60">Open ClipDude anywhere with {shortcutLabel}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
