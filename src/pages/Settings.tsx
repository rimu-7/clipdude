import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  Activity, BrushCleaning, Database, Download, FolderOpen, Keyboard, Plus, Power,
  RotateCcw, Settings2, TriangleAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, errorMessage, formatBytes, formatShortcut } from "@/lib/api";
import { downloadPercent, relativeTime } from "@/hooks/useUpdates";
import type { AppSettings, DatabaseInfo, Platform, UpdateStatus } from "@/types";

type Confirm = (options: {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}) => Promise<boolean>;

interface SettingsPageProps {
  settings: AppSettings;
  platform: Platform;
  version: string;
  shortcutError: string | null;
  onChange: (patch: Partial<AppSettings>) => Promise<boolean>;
  onClearUnpinned: () => Promise<void>;
  confirm: Confirm;
  update: UpdateStatus;
  onCheckUpdates: () => void;
  onOpenUpdate: () => void;
}

const RETENTION_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: 0, label: "Never" },
];

const MAX_ITEMS_OPTIONS = [
  { value: 200, label: "200" },
  { value: 500, label: "500" },
  { value: 1000, label: "1,000" },
  { value: 5000, label: "5,000" },
  { value: 20000, label: "20,000" },
  { value: 0, label: "Unlimited" },
];

const EXCLUDE_HINTS: Record<Platform, string> = {
  macos: "Use the app's bundle ID, e.g. com.apple.Notes. The name shown under a clip works too.",
  windows: "Use the program's file name, e.g. KeePass.exe.",
  linux: "Use the process name, e.g. keepassxc. Detection needs xdotool on X11.",
};

const MODIFIER_CODES = /^(Meta|Control|Alt|Shift|OS)(Left|Right)?$/;

export default function SettingsPage({
  settings, platform, version, shortcutError, onChange, onClearUnpinned, confirm,
  update, onCheckUpdates, onOpenUpdate,
}: SettingsPageProps) {
  const [database, setDatabase] = useState<DatabaseInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newExcludedApp, setNewExcludedApp] = useState("");
  const [recordingShortcut, setRecordingShortcut] = useState(false);

  const refreshDatabase = useCallback(async () => {
    try {
      setDatabase(await api.databaseInfo());
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    refreshDatabase();
  }, [refreshDatabase]);

  /** Runs one action at a time and reports failures. */
  const withBusy = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const changeRetention = (patch: { retention_days?: number; max_history_items?: number }) =>
    withBusy("retention", async () => {
      const days = patch.retention_days ?? settings.retention_days;
      const max = patch.max_history_items ?? settings.max_history_items;
      const affected = await api.retentionImpact(days, max);
      if (affected > 0) {
        const ok = await confirm({
          title: "Apply new retention?",
          description: `${affected.toLocaleString()} unpinned ${affected === 1 ? "clip falls" : "clips fall"} outside this limit and will be deleted now. Pinned clips are never deleted.`,
          confirmLabel: `Delete ${affected.toLocaleString()}`,
          destructive: true,
        });
        if (!ok) return;
      }
      if (await onChange(patch)) {
        toast.success(affected > 0 ? `Deleted ${affected.toLocaleString()} old clips` : "Retention updated");
        refreshDatabase();
      }
    });

  const deleteEverything = () =>
    withBusy("delete-all", async () => {
      const ok = await confirm({
        title: "Delete all history?",
        description: "Every clip, including pinned ones, will be permanently deleted. This cannot be undone.",
        confirmLabel: "Delete Everything",
        destructive: true,
      });
      if (!ok) return;
      const removed = await api.clearHistory(true);
      await api.optimizeDatabase();
      toast.success(`Deleted ${removed.toLocaleString()} ${removed === 1 ? "clip" : "clips"}`);
      refreshDatabase();
    });

  const optimize = () =>
    withBusy("optimize", async () => {
      const before = database?.size_bytes ?? 0;
      const info = await api.optimizeDatabase();
      setDatabase(info);
      const saved = before - info.size_bytes;
      toast.success(saved > 0 ? `Database optimized, freed ${formatBytes(saved)}` : "Database optimized");
    });

  const chooseFolder = () =>
    withBusy("folder", async () => {
      const selected = await open({ directory: true, multiple: false, defaultPath: database?.folder });
      if (typeof selected !== "string") return;
      const result = await api.setDatabaseFolder(selected);
      setDatabase(result.database);
      toast.success(
        result.action === "moved"
          ? "History copied to the new folder. ClipDude will use it from now on."
          : result.action === "opened"
            ? "Opened the existing ClipDude database in that folder."
            : "That folder is already in use.",
      );
    });

  const useDefaultFolder = () =>
    withBusy("folder", async () => {
      const result = await api.setDatabaseFolder(null);
      setDatabase(result.database);
      toast.success("Using the default database location.");
    });

  const resetSettings = () =>
    withBusy("reset", async () => {
      const ok = await confirm({
        title: "Reset all settings?",
        description: "Settings return to their defaults. Your clipboard history and database location are kept.",
        confirmLabel: "Reset",
        destructive: true,
      });
      if (!ok) return;
      await api.resetSettings();
      toast.success("Settings reset");
    });

  const addExcludedApp = async () => {
    const app = newExcludedApp.trim();
    if (!app) return;
    if (settings.excluded_apps.some((a) => a.toLowerCase() === app.toLowerCase())) {
      toast.info(`${app} is already excluded`);
      return;
    }
    if (await onChange({ excluded_apps: [...settings.excluded_apps, app] })) setNewExcludedApp("");
  };

  useEffect(() => {
    if (!recordingShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingShortcut(false);
        return;
      }
      if (MODIFIER_CODES.test(e.code)) return;
      const modifiers = [
        e.metaKey && (platform === "macos" ? "Command" : "Super"),
        e.ctrlKey && "Control",
        e.altKey && "Alt",
        e.shiftKey && "Shift",
      ].filter(Boolean) as string[];
      if (modifiers.length === 0 && !/^F\d+$/.test(e.code)) {
        toast.info("Include a modifier such as Ctrl, Alt, or Shift");
        return;
      }
      setRecordingShortcut(false);
      onChange({ shortcut: [...modifiers, e.code].join("+") }).then((ok) => {
        if (ok) toast.success("Shortcut updated");
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingShortcut, platform, onChange]);

  return (
    <div className="py-4 space-y-3">
      <Section icon={<Settings2 className="w-5 h-5" />} title="General">
        <ToggleRow
          title="Launch at Login"
          description="Start ClipDude automatically when you sign in."
          checked={settings.auto_start}
          onChange={(auto_start) => onChange({ auto_start })}
        />
        <ToggleRow
          title="Open Window at Login"
          description="Show the window on login. When off, ClipDude starts quietly in the menu bar / tray."
          checked={settings.show_on_login}
          disabled={!settings.auto_start}
          onChange={(show_on_login) => onChange({ show_on_login })}
        />
        <ToggleRow
          title="Smart Paste"
          description="Clicking a clip pastes it into the app you were using. When off, clicking only copies."
          checked={settings.smart_paste}
          onChange={(smart_paste) => onChange({ smart_paste })}
        />
        <ToggleRow
          title="Show Source App"
          description="Display which app each clip was copied from."
          checked={settings.show_source_app}
          onChange={(show_source_app) => onChange({ show_source_app })}
        />
        <Row
          title="Global Shortcut"
          description={
            recordingShortcut
              ? "Press the new key combination, or Esc to cancel."
              : "Shows or hides ClipDude from any app."
          }
        >
          <div className="flex items-center gap-2">
            <kbd
              className={cn(
                "px-2 py-1 rounded-md border border-border bg-background font-mono text-[11px] min-w-16 text-center",
                recordingShortcut && "border-primary text-primary animate-pulse",
              )}
            >
              {recordingShortcut ? "…" : formatShortcut(settings.shortcut, platform)}
            </kbd>
            <Button size="sm" variant="outline" onClick={() => setRecordingShortcut((r) => !r)}>
              <Keyboard /> {recordingShortcut ? "Cancel" : "Change"}
            </Button>
          </div>
        </Row>
        {shortcutError && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 px-1">{shortcutError}</p>
        )}
<UpdateRow update={update} version={version} onCheck={onCheckUpdates} onOpen={onOpenUpdate} />
        <ToggleRow
          title="Check for Updates Automatically"
          description="Look for new versions in the background and notify you when one is ready."
          checked={settings.auto_check_updates}
          onChange={(auto_check_updates) => onChange({ auto_check_updates })}
        />
      </Section>

      <Section icon={<Activity className="w-5 h-5" />} title="Recording & Privacy">
        <ToggleRow
          title="Record Clipboard"
          description="Save new copies to history. Turn off to pause recording."
          checked={settings.monitor_enabled}
          onChange={(monitor_enabled) => onChange({ monitor_enabled })}
        />
        <ToggleRow
          title="Detect Sensitive Data"
          description="Mask card numbers, API keys, and tokens in the list."
          checked={settings.detect_sensitive}
          onChange={(detect_sensitive) => onChange({ detect_sensitive })}
        />
        <ToggleRow
          title="Don't Save Sensitive Data"
          description="Skip clips that look like card numbers, API keys, or tokens entirely."
          checked={settings.skip_sensitive}
          onChange={(skip_sensitive) => onChange({ skip_sensitive })}
        />
        <div className="space-y-2 pt-1">
          <Label>Ignored Apps</Label>
          <p className="text-[11px] text-muted-foreground">
            Nothing copied in these apps is saved. Password managers that mark copies as private are always ignored. {EXCLUDE_HINTS[platform]}
          </p>
          <div className="space-y-1">
            {settings.excluded_apps.map((app) => (
              <div
                key={app}
                className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg border border-border group"
              >
                <span className="text-[11px] font-mono text-foreground/70 truncate">{app}</span>
                <button
                  onClick={() => onChange({ excluded_apps: settings.excluded_apps.filter((a) => a !== app) })}
                  className="opacity-60 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                  aria-label={`Stop ignoring ${app}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newExcludedApp}
              onChange={(e) => setNewExcludedApp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addExcludedApp()}
              placeholder={platform === "macos" ? "com.example.app" : platform === "windows" ? "App.exe" : "process-name"}
              className="flex-1 h-8 px-3 text-[11px] font-mono rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button size="sm" variant="outline" onClick={addExcludedApp} disabled={!newExcludedApp.trim()}>
              <Plus /> Add
            </Button>
          </div>
        </div>
      </Section>

      <Section icon={<Database className="w-5 h-5" />} title="Storage & Retention">
        <div className="p-3 bg-muted/50 rounded-xl border border-border space-y-1">
          <div className="flex items-center justify-between gap-3">
            <Label>Database</Label>
            {database?.available && (
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                {formatBytes(database.size_bytes)}
              </span>
            )}
          </div>
          <p className="break-all text-[11px] font-mono text-muted-foreground select-text">
            {database?.path ?? "Loading…"}
          </p>
          {database?.warning && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{database.warning}</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={chooseFolder} disabled={busy !== null}>
            <FolderOpen /> Change Folder
          </Button>
          <Button variant="outline" onClick={useDefaultFolder} disabled={busy !== null || database?.is_default}>
            <RotateCcw /> Use Default
          </Button>
          <Button variant="outline" onClick={optimize} disabled={busy !== null}>
            <BrushCleaning /> {busy === "optimize" ? "Optimizing…" : "Optimize"}
          </Button>
        </div>

        <ChoiceRow
          title="Auto-Delete Clips Not Used For"
          options={RETENTION_OPTIONS}
          value={settings.retention_days}
          disabled={busy !== null}
          onSelect={(retention_days) => changeRetention({ retention_days })}
        />
        <ChoiceRow
          title="Keep at Most"
          options={MAX_ITEMS_OPTIONS}
          value={settings.max_history_items}
          disabled={busy !== null}
          onSelect={(max_history_items) => changeRetention({ max_history_items })}
        />
        <p className="text-[11px] text-muted-foreground px-1">
          Cleanup runs at startup, after each copy, and every 30 minutes. Pinned clips are never deleted automatically.
        </p>
      </Section>

      <Section icon={<TriangleAlert className="w-5 h-5" />} title="Danger Zone" danger>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive" disabled={busy !== null} onClick={() => withBusy("clear", onClearUnpinned)}>
            Clear Unpinned History
          </Button>
          <Button variant="destructive" disabled={busy !== null} onClick={deleteEverything}>
            Delete All (Incl. Pinned)
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={resetSettings}>
            Reset All Settings
          </Button>
          <Button variant="outline" onClick={() => api.quit()}>
            <Power /> Quit ClipDude
          </Button>
        </div>
      </Section>
    </div>
  );
}

function UpdateRow({
  update, version, onCheck, onOpen,
}: {
  update: UpdateStatus;
  version: string;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const percent = downloadPercent(update);
  const checked = update.last_checked ? ` · checked ${relativeTime(update.last_checked)}` : "";
  const description = {
    idle: `You're running ClipDude ${version}.`,
    checking: "Checking for updates…",
    up_to_date: `ClipDude ${version} is up to date${checked}.`,
    available: `Version ${update.version} is available — you have ${version}.`,
    downloading: `Downloading ${update.version}${percent !== null ? ` · ${percent}%` : "…"}`,
    installing: `Installing ${update.version}… ClipDude will restart.`,
    error: update.error ?? "The last update check failed.",
  }[update.phase];
  const hasUpdate = update.version !== null && update.phase !== "checking";

  return (
    <Row title="Updates" description={description}>
      <Button
        size="sm"
        variant={hasUpdate ? "default" : "outline"}
        disabled={update.phase === "checking"}
        onClick={hasUpdate ? onOpen : onCheck}
      >
        {update.phase === "checking" ? <RotateCcw className="animate-spin" /> : <Download />}
        {hasUpdate ? "View Update" : update.phase === "checking" ? "Checking…" : "Check Now"}
      </Button>
    </Row>
  );
}

function Section({
  icon, title, danger, children,
}: {
  icon: React.ReactNode;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border rounded-2xl px-5 py-4 space-y-3 backdrop-blur-sm shadow-sm",
        danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-background/60",
      )}
    >
      <h2 className={cn("flex items-center gap-3 text-sm font-bold", danger && "text-destructive")}>
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
  );
}

function Row({
  title, description, children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-xl border border-border">
      <div className="space-y-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  title, description, checked, disabled, onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Row title={title} description={description}>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-40",
          checked ? "border-primary bg-primary" : "border-border bg-muted hover:bg-muted/80",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background shadow-md transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </Row>
  );
}

function ChoiceRow({
  title, options, value, disabled, onSelect,
}: {
  title: string;
  options: { value: number; label: string }[];
  value: number;
  disabled?: boolean;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => !active && onSelect(option.value)}
              className={cn(
                "px-3 h-7 rounded-lg border text-[11px] font-mono transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted text-foreground/80",
              )}
            >
              {option.label}
            </button>
          );
        })}
        {!options.some((option) => option.value === value) && (
          <span className="px-3 h-7 inline-flex items-center rounded-lg border border-primary text-[11px] font-mono text-primary">
            {value.toLocaleString()} (custom)
          </span>
        )}
      </div>
    </div>
  );
}
