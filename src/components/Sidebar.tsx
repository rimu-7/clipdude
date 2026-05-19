import { useEffect, useMemo, useState } from "react";
import {
  Clipboard, Layers, Pin, Settings, Moon, Sun, Menu, X, Zap, Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/App";

interface SidebarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  totalClips: number;
  pinnedClips: number;
  onClearAll: () => void;
  clearConfirm: boolean;
}

interface NavItem {
  id: ViewMode;
  label: string;
  icon: typeof Layers;
  count?: number;
}

export default function Sidebar({
  viewMode, onViewChange, isDark, onToggleTheme,
  totalClips, pinnedClips, onClearAll, clearConfirm,
}: SidebarProps) {
  const items: NavItem[] = useMemo(
    () => [
      { id: "all", label: "All Clips", icon: Layers, count: totalClips },
      { id: "pinned", label: "Pinned", icon: Pin, count: pinnedClips },
      { id: "settings", label: "Settings", icon: Settings },
    ],
    [totalClips, pinnedClips]
  );

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [viewMode]);

  const ClearButton = (
    <button
      onClick={onClearAll}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/40",
        clearConfirm
          ? "bg-destructive/10 text-destructive"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      {clearConfirm ? (
        <Trash2 className="w-4 h-4 shrink-0" />
      ) : (
        <Zap className="w-4 h-4 shrink-0" />
      )}
      <span>{clearConfirm ? "Confirm Clear" : "Clear Unpinned"}</span>
    </button>
  );

  const ThemeButton = (
    <Button
      variant="ghost"
      onClick={onToggleTheme}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 outline-none",
        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        "focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
    >
      <motion.div
        key={isDark ? "moon" : "sun"}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </motion.div>
      <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
    </Button>
  );

  const NavItems = (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = viewMode === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 outline-none",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-full" />}
            <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className={cn(
                "ml-auto text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-full transition-colors duration-200",
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70"
              )}>
                {item.count > 999 ? "999+" : item.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 w-56 flex-col bg-background/80 backdrop-blur-xl border-r border-border/50 transition-colors duration-300">
        <div className="flex items-center gap-2.5 px-5 h-14 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
            <Clipboard className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-bold text-base tracking-tight">ClipDude</span>
        </div>
        <Separator className="mx-4 w-auto opacity-60" />
        <div className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
          {NavItems}
        </div>
        <div className="px-3 pb-3 shrink-0 space-y-1">
          <Separator className="mb-2 mx-0 w-auto opacity-60" />
          {ClearButton}
          {ThemeButton}
        </div>
      </aside>

      {/* Mobile Header + Drawer */}
      <div className="lg:hidden">
        <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-background/75 backdrop-blur-xl border-b border-border/50">
          <div className="h-full px-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="rounded-xl" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
                <Clipboard className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-semibold tracking-tight truncate">ClipDude</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                onClick={onClearAll}
                className={cn("rounded-xl", clearConfirm && "text-destructive")}
                aria-label="Clear unpinned clips"
              >
                <Zap className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={onToggleTheme}
                className="rounded-xl"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close menu overlay"
                className="fixed inset-0 z-40 bg-black/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                className="fixed top-0 left-0 bottom-0 z-50 w-[min(84vw,320px)] bg-background border-r border-border/60 shadow-2xl"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="h-14 px-4 flex items-center gap-2 border-b border-border/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
                      <Clipboard className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="font-semibold tracking-tight truncate">ClipDude</span>
                  </div>
                  <Button variant="ghost" size="icon" className="ml-auto rounded-xl" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="p-3 space-y-1">
                  {NavItems}
                  <Separator className="my-3 opacity-60" />
                  {ClearButton}
                  {ThemeButton}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
