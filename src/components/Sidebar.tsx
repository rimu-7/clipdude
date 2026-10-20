import {
  Clipboard, Layers, Pin, Settings, Moon, Sun, Trash2, Pause, Play, Sparkles, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { downloadPercent } from "@/hooks/useUpdates";
import type { Stats, UpdateStatus, ViewMode } from "@/types";

interface SidebarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  stats: Stats;
  recording: boolean;
  onToggleRecording: () => void;
  onClearUnpinned: () => void;
  shortcutLabel: string;
  update: UpdateStatus;
  skippedUpdateVersion: string;
  onOpenUpdate: () => void;
}

const itemClass =
  "relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export default function Sidebar({
  viewMode, onViewChange, isDark, onToggleTheme, stats, recording, onToggleRecording,
  onClearUnpinned, shortcutLabel, update, skippedUpdateVersion, onOpenUpdate,
}: SidebarProps) {
  const items = [
    { id: "all" as const, label: "All Clips", icon: Layers, count: stats.total },
    { id: "pinned" as const, label: "Pinned", icon: Pin, count: stats.pinned },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 w-56 flex flex-col bg-background/80 backdrop-blur-xl border-r border-border/50 transition-colors duration-300">
      <div className="flex items-center gap-2.5 px-5 h-14 shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
          <Clipboard className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-bold text-base tracking-tight">ClipDude</span>
      </div>
      <Separator className="mx-4 w-auto opacity-60" />

      <nav className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                itemClass,
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-full" />}
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.count !== undefined && (
                <span className={cn(
                  "ml-auto text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-full transition-colors duration-200",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70"
                )}>
                  {item.count > 9999 ? "9999+" : item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3 shrink-0 space-y-1">
        <UpdateCard update={update} skippedVersion={skippedUpdateVersion} onOpen={onOpenUpdate} />
        <Separator className="mb-2 mx-0 w-auto opacity-60" />
        <button
          onClick={onToggleRecording}
          className={cn(itemClass, "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
          title={recording ? "Stop saving new copies" : "Start saving new copies"}
        >
          <span className="relative flex w-4 h-4 items-center justify-center shrink-0">
            {recording ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </span>
          <span>{recording ? "Pause Recording" : "Resume Recording"}</span>
          <span
            className={cn(
              "ml-auto w-2 h-2 rounded-full",
              recording ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )}
          />
        </button>
        <button
          onClick={onClearUnpinned}
          className={cn(itemClass, "text-muted-foreground hover:text-destructive hover:bg-destructive/10")}
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>Clear Unpinned</span>
        </button>
        <button
          onClick={onToggleTheme}
          className={cn(itemClass, "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
        >
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.span>
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <p className="px-3 pt-2 text-[10px] font-mono text-muted-foreground/50">
          Open anywhere with <kbd className="text-muted-foreground/80">{shortcutLabel}</kbd>
        </p>
      </div>
    </aside>
  );
}

function UpdateCard({
  update, skippedVersion, onOpen,
}: {
  update: UpdateStatus;
  skippedVersion: string;
  onOpen: () => void;
}) {
  const working = update.phase === "downloading" || update.phase === "installing";
  const available = update.phase === "available" && update.version !== skippedVersion;
  if (!working && !available) return null;
  const percent = downloadPercent(update);

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="mb-2 w-full rounded-xl border border-primary/30 bg-primary/10 p-3 text-left transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-center gap-2 text-primary">
        {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        <span className="text-[11px] font-bold uppercase tracking-widest">
          {update.phase === "installing" ? "Installing" : working ? "Updating" : "Update Available"}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground/80">
        {working
          ? percent !== null && update.phase === "downloading"
            ? `Downloading ${update.version} · ${percent}%`
            : `ClipDude ${update.version}`
          : `Version ${update.version} is ready. Click to see what's new.`}
      </p>
      {working && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${update.phase === "installing" ? 100 : (percent ?? 30)}%` }}
          />
        </div>
      )}
    </motion.button>
  );
}
