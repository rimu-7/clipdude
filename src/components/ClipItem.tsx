"use client";

import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Trash } from "lucide-react";
import { ClipItemProps } from "@/types";

export default function ClipItem({
    clip,
    index,
    onInternalCopy,
    onDelete,
}: ClipItemProps) {
    const [copied, setCopied] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const title =
        clip.content.replace(/\s+/g, " ").trim().substring(0, 40) +
        (clip.content.length > 40 ? "..." : "");

    const doCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        await writeText(clip.content);
        setCopied(true);
        await onInternalCopy(clip.content);

        setTimeout(() => setCopied(false), 2000);
    };

    const doDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onDelete(clip.id);
    };

    return (
        <div
            className={`w-full rounded-2xl border border-border bg-background shadow-sm transition-colors ${
                isOpen ? "pb-2" : ""
            }`}
        >
            <div className="flex items-center justify-between pr-4">
                <button
                    onClick={() => setIsOpen((prev) => !prev)}
                    className="flex-1 rounded-2xl px-4 py-4 text-left"
                    aria-expanded={isOpen}
                >
                    <div className="flex items-center gap-4 w-full">
                        <span className="text-[10px] font-bold text-muted-foreground w-6 shrink-0">
                            {index}.
                        </span>

                        <h3 className="text-sm font-bold tracking-tight truncate w-30 sm:w-32 md:w-64 text-foreground">
                            {title}
                        </h3>
                    </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={doDelete}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <Trash className="w-4 h-4" />
                    </button>

                    <button
                        onClick={doCopy}
                        className={`text-[9px] font-black px-4 py-2 rounded-full tracking-widest uppercase cursor-pointer transition-colors border border-border ${
                            copied
                                ? "bg-emerald-500 text-white"
                                : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                        }`}
                    >
                        {copied ? "COPIED" : "Copy"}
                    </button>
                </div>
            </div>

            <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                    isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                }`}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4">
                        <div className="p-4 rounded-xl bg-secondary border border-border transition-colors">
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed text-muted-foreground max-h-96 overflow-y-auto custom-scrollbar">
                                {clip.content}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
