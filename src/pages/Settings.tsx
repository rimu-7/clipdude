import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BrushCleaning,
  File,
  TriangleAlert,
  Settings2,
  Power,
} from "lucide-react";
import { exit } from "@tauri-apps/plugin-process";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";


export default function SettingsPage({
  dbPath,
  onSelectFolder,
  onBack,
  onClearHistory,
  onResetApp,
  onDeleteRange,
}: any) {
  const [autoStart, setAutoStart] = useState(false);

  // Load initial autostart status on mount
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

  // Handle Autostart Toggle
  const handleToggleAutoStart = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutoStart(checked);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
      setAutoStart(!checked); // revert on error
    }
  };

  return (
    <div className="py-6 space-y-6">
      <Button
        variant="ghost"
        onClick={onBack}
        className="text-zinc-400 hover:text-emerald-500 text-[10px] font-black uppercase tracking-widest -ml-4"
      >
        ← Return to HomePage
      </Button>

      <Accordion
        type="multiple"
        defaultValue={["system", "storage", "cleanup"]}
        className="space-y-4"
      >
        {/* ==========================================
            SYSTEM & BEHAVIOR
            ========================================== */}
        <AccordionItem
          value="system"
          className="border border-border rounded-2xl px-5 bg-background shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <Settings2 className="w-5 h-5" /> System & Behavior
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground">
                  Launch on Login
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Start ClipDude automatically when your computer boots up.
                </p>
              </div>

              <button
                role="switch"
                aria-checked={autoStart}
                onClick={() => handleToggleAutoStart(!autoStart)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  autoStart
                    ? "border-primary bg-primary shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                    : "border-border bg-muted hover:bg-muted/80"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow-md ring-0 transition-all duration-300 ease-in-out ${
                    autoStart ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==========================================
            STORAGE
            ========================================== */}
        <AccordionItem
          value="storage"
          className="border border-border rounded-2xl px-5 bg-background shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <File className="w-5 h-5" /> Storage Configuration
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-5">
            <div className="p-3 bg-muted rounded-xl border border-border break-all text-[10px] font-mono text-muted-foreground">
              {dbPath || "No path selected"}
            </div>
            <Button
              onClick={onSelectFolder}
              className="w-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
            >
              Move Database
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* ==========================================
            CLEANUP
            ========================================== */}
        <AccordionItem
          value="cleanup"
          className="border border-border rounded-2xl px-5 bg-background shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline text-sm font-bold">
            <span className="flex items-center gap-3">
              <BrushCleaning className="w-5 h-5" /> History Cleanup
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

        {/* ==========================================
            DANGER ZONE (Merged and Fixed)
            ========================================== */}
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
              Clear All History
            </Button>

            <Button
              variant="destructive"
              onClick={onResetApp}
              className="w-full text-[10px] font-black uppercase tracking-widest opacity-90 hover:opacity-100"
            >
              Reset All Settings
            </Button>

            <div className="w-full h-px bg-destructive/20 my-4" />

            {/* HARD CLOSE */}
            <Button
              onClick={async () => await exit(0)}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
            >
              <Power className="w-3 h-3" /> Hard Close ClipDude
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
