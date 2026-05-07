import { ChevronDown, Copy, Trash2, Pin, PinOff } from "lucide-react";
import { Clip } from "../types";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface GroupAccordionProps {
  title: string;
  icon?: React.ReactNode;
  group: Clip[];
  isOpen: boolean;
  onToggle: () => void;
  onInternalCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number, currentStatus: number) => void; // ADD THIS
}

export default function GroupAccordion({
  title,
  icon,
  group,
  isOpen,
  onToggle,
  onInternalCopy,
  onDelete,
  onTogglePin,
}: GroupAccordionProps) {
  const handleCopy = async (text: string) => {
    try {
      await writeText(text);
      onInternalCopy(text);
      toast.success("Copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border bg-card/70 backdrop-blur-xl shadow-sm transition-all">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-mono text-sm uppercase tracking-wider font-bold text-foreground">
            {title}{" "}
            <span className="text-muted-foreground font-normal">
              ({group.length})
            </span>
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-2">
              {group.map((clip) => (
                <div
                  key={clip.id}
                  className="group flex items-start gap-3 p-3 border-2 border-transparent hover:border-border transition-colors bg-background"
                >
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-mono whitespace-pre-wrap break-all text-foreground/90 line-clamp-3">
                      {clip.content}
                    </p>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleCopy(clip.content)}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onTogglePin(clip.id, clip.is_pinned)}
                      className={`p-1.5 transition-colors ${clip.is_pinned ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                      title={clip.is_pinned ? "Unpin" : "Pin"}
                    >
                      {clip.is_pinned ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => onDelete(clip.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
