import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BrushCleaning,
  TriangleAlert,
  Settings2,
  Power,
  Shield,
  Plus,
  X,
  Database,
  Activity,
} from "lucide-react";
import { exit } from "@tauri-apps/plugin-process";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types";

export default function SettingsPage({
  dbPath,
  onSelectFolder,
  onBack,
  onClearHistory,
  onResetApp,
  onDeleteRange,
}: any) {
  const [autoStart, setAutoStart] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [newExcludedApp, setNewExcludedApp] = useState("");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = await load("settings.json", {
          autoSave: true,
          defaults: {},
        } as any);
        const loaded = { ...DEFAULT_SETTINGS };
        const keys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
        for (const key of keys) {
          const saved = await store.get(key);
          if (saved !== null && saved !== undefined) {
            (loaded as any)[key] = saved;
          }
        }
        setSettings(loaded);
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const checkAutostart = async () => {
      try {
        const enabled = await isEnabled();
        setAutoStart(enabled);
      } catch (err) {
        console.error("Failed to check autostart status:", err);
      }
    };
    checkAutostart();
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      try {
        const store = await load("settings.json", {
          autoSave: true,
          defaults: {},
        } as any);
        await store.set(key, value);
        setSettings((prev) => ({ ...prev, [key]: value }));
      } catch (e) {
        console.error("Failed to update setting", e);
      }
    },
    []
  );

  const handleToggleAutoStart = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutoStart(checked);
      await updateSetting("auto_start", checked);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
      setAutoStart(!checked);
    }
  };

  const handleToggleMonitor = async (enabled: boolean) => {
    try {
      await invoke("set_monitor_enabled", { enabled });
      await updateSetting("monitor_enabled", enabled);
    } catch (e) {
      console.error("Failed to toggle monitor:", e);
    }
  };

  const handleAddExcludedApp = async () => {
    if (!newExcludedApp.trim()) return;
    const updated = [...settings.excluded_apps, newExcludedApp.trim()];
    await updateSetting("excluded_apps", updated);
    try {
      await invoke("set_excluded_apps", { apps: updated });
    } catch (_) {}
    setNewExcludedApp("");
  };

  const handleRemoveExcludedApp = async (index: number) => {
    const updated = settings.excluded_apps.filter((_, i) => i !== index);
    await updateSetting("excluded_apps", updated);
    try {
      await invoke("set_excluded_apps", { apps: updated });
    } catch (_) {}
  };

  const Toggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (val: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        checked
          ? "border-primary bg-primary shadow-[0_0_8px_rgba(34,197,94,0.3)]"
          : "border-border bg-muted hover:bg-muted/80"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow-md ring-0 transition-all duration-300 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );

  return (
    <div className="py-4 space-y-4">
      <Button
        variant="ghost"
        onClick={onBack}
        className="text-zinc-400 hover:text-primary text-[10px] font-black uppercase tracking-widest -ml-4"
      >
        &larr; Return to Clipboard
      </Button>

      <Accordion
        type="multiple"
        defaultValue={["system", "monitor", "privacy", "storage", "cleanup"]}
        className="space-y-3"
      >
        <AccordionItem
          value="system"
          className="border border-border rounded-2xl px-5 bg-background/60 backdrop-blur-sm shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <Settings2 className="w-5 h-5" /> System & Behavior
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Launch at Login
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Start ClipDude automatically when your computer boots.
                </p>
              </div>
              <Toggle
                checked={autoStart}
                onChange={handleToggleAutoStart}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Smart Paste
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Auto-paste into the active app after selecting a clip.
                </p>
              </div>
              <Toggle
                checked={settings.smart_paste}
                onChange={(v) => updateSetting("smart_paste", v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Show Source App
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Display which app the clip was copied from.
                </p>
              </div>
              <Toggle
                checked={settings.show_source_app}
                onChange={(v) => updateSetting("show_source_app", v)}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="monitor"
          className="border border-border rounded-2xl px-5 bg-background/60 backdrop-blur-sm shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <Activity className="w-5 h-5" /> Clipboard Monitor
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Monitor Active
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Watch the clipboard for new copies. Disable to pause recording.
                </p>
              </div>
              <Toggle
                checked={settings.monitor_enabled}
                onChange={handleToggleMonitor}
              />
            </div>

            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    settings.monitor_enabled
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-muted-foreground/30"
                  }`}
                />
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Monitor {settings.monitor_enabled ? "Active" : "Paused"}
                </span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="privacy"
          className="border border-border rounded-2xl px-5 bg-background/60 backdrop-blur-sm shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <Shield className="w-5 h-5" /> Privacy & Security
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Detect Sensitive Data
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Auto-detect and mask credit cards, API keys in the UI.
                </p>
              </div>
              <Toggle
                checked={settings.detect_sensitive}
                onChange={(v) => updateSetting("detect_sensitive", v)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Excluded Apps (blacklist)
              </p>
              <p className="text-[9px] text-muted-foreground/60">
                Clips copied from these apps will be ignored.
              </p>

              <div className="space-y-1">
                {settings.excluded_apps.map((app, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg border border-border group"
                  >
                    <span className="text-[11px] font-mono text-foreground/70 truncate">
                      {app}
                    </span>
                    <button
                      onClick={() => handleRemoveExcludedApp(index)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newExcludedApp}
                  onChange={(e) => setNewExcludedApp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddExcludedApp()}
                  placeholder="com.example.app"
                  className="flex-1 h-8 px-3 text-[11px] font-mono rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddExcludedApp}
                  className="h-8 px-3 text-[10px] font-bold uppercase"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="storage"
          className="border border-border rounded-2xl px-5 bg-background/60 backdrop-blur-sm shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <Database className="w-5 h-5" /> Storage & Retention
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <div className="p-3 bg-muted rounded-xl border border-border break-all text-[10px] font-mono text-muted-foreground">
              {dbPath || "No path selected"}
            </div>
            <Button
              onClick={onSelectFolder}
              className="w-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
            >
              Move Database
            </Button>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Max History Items
                  </p>
                  <span className="text-[11px] font-mono text-primary tabular-nums">
                    {settings.max_history_items || "Unlimited"}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={settings.max_history_items}
                  onChange={(e) =>
                    updateSetting(
                      "max_history_items",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground/40 font-mono">
                  <span>100</span>
                  <span>5000</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Auto-Delete After (days)
                  </p>
                  <span className="text-[11px] font-mono text-primary tabular-nums">
                    {settings.retention_days || "Never"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={365}
                  step={7}
                  value={settings.retention_days}
                  onChange={(e) =>
                    updateSetting("retention_days", parseInt(e.target.value))
                  }
                  className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground/40 font-mono">
                  <span>Never (0)</span>
                  <span>365</span>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="cleanup"
          className="border border-border rounded-2xl px-5 bg-background/60 backdrop-blur-sm shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <BrushCleaning className="w-5 h-5" /> Manual Cleanup
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
              Delete Older Than:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => onDeleteRange("day")}
                className="text-[10px] font-bold uppercase hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                24 Hours
              </Button>
              <Button
                variant="outline"
                onClick={() => onDeleteRange("week")}
                className="text-[10px] font-bold uppercase hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                7 Days
              </Button>
              <Button
                variant="outline"
                onClick={() => onDeleteRange("month")}
                className="text-[10px] font-bold uppercase hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                30 Days
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="danger"
          className="border border-destructive/30 rounded-2xl px-5 bg-destructive/5"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold text-destructive">
            <span className="flex items-center gap-3">
              <TriangleAlert className="w-5 h-5" /> Danger Zone
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5">
            <Button
              variant="outline"
              onClick={onClearHistory}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              Clear All Unpinned History
            </Button>

            <Button
              variant="destructive"
              onClick={onResetApp}
              className="w-full text-[10px] font-black uppercase tracking-widest opacity-90 hover:opacity-100"
            >
              Reset All Settings
            </Button>

            <div className="w-full h-px bg-destructive/20 my-4" />

            <Button
              onClick={async () => await exit(0)}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
            >
              <Power className="w-3 h-3" /> Quit ClipDude
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
