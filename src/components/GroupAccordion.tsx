import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, Copy, Trash2, Pin, PinOff, Shield, MoreHorizontal, CornerDownLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { TRANSFORM_LABELS, type TextTransform } from "@/lib/textTransforms";
import type { Clip } from "@/types";

export interface ClipActions {
  onActivate: (clip: Clip) => void;
  onCopy: (clip: Clip) => void;
  onTogglePin: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
  onTransform: (clip: Clip, kind: TextTransform) => void;
}

interface GroupAccordionProps extends ClipActions {
  title: string;
  icon?: React.ReactNode;
  clips: Clip[];
  /** Position of the first clip, for the "#n" labels. */
  startIndex?: number;
  isOpen: boolean;
  onToggle: () => void;
  smartPaste: boolean;
  showSourceApp: boolean;
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

function formatTime(ms: number): string {
  return ms > 0 ? timeFormat.format(new Date(ms)) : "";
}

export default function GroupAccordion({
  title, icon, clips, startIndex, isOpen, onToggle, smartPaste, showSourceApp, ...actions
}: GroupAccordionProps) {
  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border transition-all duration-300",
      "bg-card/60 backdrop-blur-sm",
      isOpen ? "border-border/60 shadow-sm" : "border-border/40 hover:border-border/50"
    )}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 transition-colors duration-200",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        )}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="font-mono text-[13px] uppercase tracking-wider font-bold text-foreground">{title}</span>
          <span className="text-muted-foreground/70 font-mono text-xs tabular-nums">{clips.length}</span>
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen && "rotate-180"
        )} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-0.5">
              {clips.map((clip, i) => (
                <ClipRow
                  key={clip.id}
                  clip={clip}
                  position={startIndex !== undefined ? startIndex + i : undefined}
                  smartPaste={smartPaste}
                  showSourceApp={showSourceApp}
                  {...actions}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ClipRow = memo(function ClipRow({
  clip, position, smartPaste, showSourceApp, onActivate, onCopy, onTogglePin, onDelete, onTransform,
}: ClipActions & { clip: Clip; position?: number; smartPaste: boolean; showSourceApp: boolean }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const preview = clip.preview.replace(/\s+/g, " ").trim();
  const truncated = clip.length > clip.preview.length;

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenu(null);
      }
    };
    const onBlur = () => setMenu(null);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [menu]);

  const run = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
        "border border-transparent",
        "hover:border-border/40 hover:bg-background/60",
        "focus-within:border-primary/30"
      )}
      onContextMenu={openMenu}
    >
      <span className="text-[10px] font-mono font-bold text-muted-foreground/40 w-7 shrink-0 pt-[3px] tabular-nums select-none">
        {position !== undefined ? `#${position}` : ""}
      </span>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => onActivate(clip)}
          className="w-full text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          title={smartPaste ? "Paste into the previous app" : "Copy"}
        >
          <p className="text-[13px] font-mono whitespace-pre-wrap break-all text-foreground/85 leading-relaxed line-clamp-3 group-hover:line-clamp-5">
            {preview}
            {truncated && <span className="text-muted-foreground/50">…</span>}
          </p>
        </button>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">{formatTime(clip.last_used)}</p>
          {showSourceApp && clip.source_app && (
            <span className="text-[9px] text-muted-foreground/40 font-mono truncate max-w-[160px]">{clip.source_app}</span>
          )}
          {truncated && (
            <span className="text-[9px] text-muted-foreground/40 font-mono tabular-nums">
              {clip.length.toLocaleString()} chars
            </span>
          )}
          {clip.is_sensitive && (
            <span className="flex items-center gap-0.5 text-[9px] text-amber-500/80 font-mono">
              <Shield className="w-2.5 h-2.5" /> Sensitive
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 shrink-0 pt-0.5">
        {smartPaste && (
          <IconButton title="Paste" onClick={() => onActivate(clip)} className="hover:text-emerald-500 hover:bg-emerald-500/10">
            <CornerDownLeft className="w-3.5 h-3.5" />
          </IconButton>
        )}
        <IconButton title="Copy" onClick={() => onCopy(clip)} className="hover:text-primary hover:bg-primary/10">
          <Copy className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton
          title={clip.is_pinned ? "Unpin" : "Pin"}
          onClick={() => onTogglePin(clip)}
          className={cn("hover:text-primary hover:bg-primary/10", clip.is_pinned && "text-primary")}
        >
          {clip.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </IconButton>
        <IconButton title="Delete" onClick={() => onDelete(clip)} className="hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton title="More" onClick={openMenu} className="hover:text-foreground hover:bg-muted">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.08 }}
            className="fixed z-[999] min-w-[200px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover/95 backdrop-blur-xl shadow-xl py-1"
            style={{
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 216)),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 420)),
            }}
          >
            {smartPaste && (
              <MenuItem icon={<CornerDownLeft className="w-3.5 h-3.5" />} label="Paste" onClick={run(() => onActivate(clip))} />
            )}
            <MenuItem icon={<Copy className="w-3.5 h-3.5" />} label="Copy" onClick={run(() => onCopy(clip))} />
            <MenuItem
              icon={clip.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              label={clip.is_pinned ? "Unpin" : "Pin"}
              onClick={run(() => onTogglePin(clip))}
            />
            <div className="h-px bg-border mx-2 my-1" />
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">
              Copy as
            </div>
            {(Object.entries(TRANSFORM_LABELS) as [TextTransform, string][]).map(([kind, label]) => (
              <MenuItem key={kind} label={label} onClick={run(() => onTransform(clip, kind))} />
            ))}
            <div className="h-px bg-border mx-2 my-1" />
            <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" destructive onClick={run(() => onDelete(clip))} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function IconButton({
  title, onClick, className, children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "p-1.5 text-muted-foreground/60 rounded-lg transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon, label, destructive, onClick,
}: {
  icon?: React.ReactNode; label: string; destructive?: boolean; onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium transition-colors duration-100",
        destructive ? "text-destructive hover:bg-destructive/10" : "text-popover-foreground hover:bg-muted"
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
