import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown, Copy, Trash2, Pin, PinOff, Shield, MoreHorizontal, ExternalLink,
} from "lucide-react";
import { type Clip } from "../types";
import { type TextTransform } from "@/lib/textTransforms";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { detectSensitiveData } from "@/lib/privacy";
import { TRANSFORM_LABELS, applyTransform } from "@/lib/textTransforms";

interface GroupAccordionProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  group: Clip[];
  isOpen: boolean;
  onToggle: () => void;
  onInternalCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number, currentStatus: number) => void;
  onCopyAndHide?: (clip: Clip) => void;
  onTransform?: (clip: Clip, transformed: string) => void;
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr + "Z");
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "…";
}

export default function GroupAccordion({
  title, icon, group, isOpen, onToggle, onInternalCopy, onDelete, onTogglePin, onCopyAndHide, onTransform,
}: GroupAccordionProps) {
  const handleCopy = async (text: string) => {
    try {
      await writeText(text);
      onInternalCopy(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please try again.");
    }
  };

  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border transition-all duration-300",
      "bg-card/60 backdrop-blur-sm",
      isOpen ? "border-border/60 shadow-sm" : "border-border/40 hover:border-border/50"
    )}>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 transition-colors duration-200",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        )}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="font-mono text-[13px] uppercase tracking-wider font-bold text-foreground">{title}</span>
          <span className="text-muted-foreground/70 font-mono text-xs tabular-nums">{group.length}</span>
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
            transition={{ height: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-0.5">
              {group.map((clip) => (
                <ClipRow
                  key={clip.id}
                  clip={clip}
                  onCopy={handleCopy}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onCopyAndHide={onCopyAndHide}
                  onTransform={onTransform}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClipRow({
  clip, onCopy, onDelete, onTogglePin, onCopyAndHide, onTransform,
}: {
  clip: Clip;
  onCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number, status: number) => void;
  onCopyAndHide?: (clip: Clip) => void;
  onTransform?: (clip: Clip, transformed: string) => void;
}) {
  const isPinned = clip.is_pinned === 1;
  const isSensitive = clip.is_sensitive === 1;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensitiveInfo = isSensitive ? detectSensitiveData(clip.content) : null;
  const displayContent = isSensitive && sensitiveInfo ? sensitiveInfo.maskedContent : clip.content;
  const previewText = truncate(displayContent.replace(/\s+/g, " ").trim(), 200);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
      if (e instanceof KeyboardEvent && e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [contextMenu]);

  const handleTransform = (transform: TextTransform) => {
    const result = applyTransform(clip.content, transform);
    if (result !== null && onTransform) {
      onTransform(clip, result);
    } else {
      toast.error("Transform not applicable to this content.");
    }
    setContextMenu(null);
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
        "border border-transparent",
        "hover:border-border/40 hover:bg-background/60",
        "focus-within:border-primary/30"
      )}
      onContextMenu={handleContextMenu}
    >
      <span className="text-[10px] font-mono font-bold text-muted-foreground/40 w-7 shrink-0 pt-[3px] tabular-nums select-none">
        #{clip.rank || clip.id}
      </span>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => onCopyAndHide ? onCopyAndHide(clip) : onCopy(clip.content)}
          className="w-full text-left"
          title={onCopyAndHide ? "Click to copy and paste" : "Click to copy"}
        >
          <p className={cn(
            "text-[13px] font-mono whitespace-pre-wrap break-all text-foreground/85 leading-relaxed",
            "line-clamp-3 group-hover:line-clamp-5 transition-all duration-200"
          )}>
            {previewText}
          </p>
        </button>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">{formatTime(clip.created_at)}</p>
          {clip.source_app && (
            <span className="text-[9px] text-muted-foreground/30 font-mono truncate max-w-[120px]">{clip.source_app}</span>
          )}
          {isSensitive && (
            <span className="flex items-center gap-0.5 text-[9px] text-amber-500/70 font-mono">
              <Shield className="w-2.5 h-2.5" /> Sensitive
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 pt-0.5">
        {onCopyAndHide && (
          <button
            onClick={() => onCopyAndHide(clip)}
            className="p-1.5 text-muted-foreground/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors duration-150"
            title="Copy & Paste"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onCopy(clip.content)}
          className="p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors duration-150"
          title="Copy"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onTogglePin(clip.id, clip.is_pinned)}
          className={cn(
            "p-1.5 rounded-lg transition-colors duration-150",
            isPinned ? "text-primary hover:bg-primary/10" : "text-muted-foreground/60 hover:text-primary hover:bg-primary/10"
          )}
          title={isPinned ? "Unpin" : "Pin"}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onDelete(clip.id)}
          className="p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors duration-150"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
          className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-150"
          title="More"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[999] min-w-[200px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover/95 backdrop-blur-xl shadow-xl py-1"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 400),
            }}
          >
            {onCopyAndHide && (
              <ContextMenuItem
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                label="Copy & Paste"
                shortcut="⌘⇧V"
                onClick={() => { onCopyAndHide(clip); setContextMenu(null); }}
              />
            )}
            <ContextMenuItem icon={<Copy className="w-3.5 h-3.5" />} label="Copy" onClick={() => { onCopy(clip.content); setContextMenu(null); }} />
            <ContextMenuItem
              icon={isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              label={isPinned ? "Unpin" : "Pin"}
              onClick={() => { onTogglePin(clip.id, clip.is_pinned); setContextMenu(null); }}
            />
            <div className="h-px bg-border mx-2 my-1" />
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Transforms</div>
            {(Object.entries(TRANSFORM_LABELS) as [TextTransform, string][]).map(([key, label]) => (
              <ContextMenuItem key={key} label={label} onClick={() => handleTransform(key)} />
            ))}
            <div className="h-px bg-border mx-2 my-1" />
            <ContextMenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" destructive onClick={() => { onDelete(clip.id); setContextMenu(null); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContextMenuItem({
  icon, label, shortcut, destructive, onClick,
}: {
  icon?: React.ReactNode; label: string; shortcut?: string; destructive?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium transition-colors duration-100",
        destructive ? "text-destructive hover:bg-destructive/10" : "text-popover-foreground hover:bg-muted"
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-muted-foreground/50 font-mono">{shortcut}</span>}
    </button>
  );
}
