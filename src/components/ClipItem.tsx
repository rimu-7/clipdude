import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ask } from "@tauri-apps/plugin-dialog";
import { Copy, Check, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import { Clip } from "../App";

interface ClipItemProps {
    clip: Clip;
    index: number;
    onInternalCopy: (t: string) => void;
    onDeleteClip: (id: number) => void;
}

export default function ClipItem({
    clip,
    index,
    onInternalCopy,
    onDeleteClip,
}: ClipItemProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const title =
        clip.content.replace(/\s+/g, " ").trim().substring(0, 15) +
        (clip.content.length > 15 ? "..." : "");

    const doCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await writeText(clip.content);
        setCopied(true);
        await onInternalCopy(clip.content);
        setTimeout(() => setCopied(false), 2000);
    };

    const doDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = await ask(
            "Are you sure you want to delete this clip?",
            { title: "Delete Clip", kind: "warning" },
        );
        if (confirmed) onDeleteClip(clip.id);
    };

    return (
        <motion.div
            layout
            className="border border-zinc-200 dark:border-zinc-800 hover:border-emerald-300 dark:hover:border-emerald-700/50 rounded-xl overflow-hidden duration-300 shadow-sm bg-zinc-50 dark:bg-zinc-800/20"
        >
            <div
                className="p-3 pl-4 flex items-center justify-between cursor-pointer active:bg-zinc-100 dark:active:bg-zinc-800"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-zinc-400 w-6">
                        {index}.
                    </span>
                    <h3 className="text-sm font-semibold tracking-tight truncate w-32 md:w-56 text-zinc-900 dark:text-zinc-200">
                        {title}
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={doDelete}
                        className="text-zinc-400 hover:text-red-500"
                    >
                        <Trash2 size={14} />
                    </Button>
                    <Button
                        variant={copied ? "primary" : "outline"}
                        size="sm"
                        onClick={doCopy}
                        icon={copied ? <Check size={12} /> : <Copy size={12} />}
                    >
                        {copied ? "Copied" : "Copy"}
                    </Button>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4"
                    >
                        <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto mt-2">
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed text-zinc-700 dark:text-zinc-300">
                                {clip.content}
                            </pre>
                        </div>
                        {clip.created_at && (
                            <div className="mt-2 text-[9px] text-zinc-400 text-right uppercase tracking-widest">
                                {new Date(clip.created_at).toLocaleString()}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
