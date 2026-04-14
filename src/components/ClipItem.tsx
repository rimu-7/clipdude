"use client";

import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "./ui/button";
import { Trash } from "lucide-react";

type ClipItemProps = {
    clip: {
        id: string | number;
        content: string;
    };
    index: number;
    onInternalCopy: (text: string) => Promise<void>;
    onDelete: (id: string | number) => void;
};

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

    const toggleAccordion = () => {
        setIsOpen((prev) => !prev);
    };

    return (
        <div
            className={`w-full border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm transition-all${
                isOpen ? "pb-2" : ""
            }`}
        >
            <div className="flex items-center justify-between pr-4">
                <Button
                    variant="ghost"
                    onClick={toggleAccordion}
                    className="flex-1 rounded-2xl px-4 py-4 text-left"
                    aria-expanded={isOpen}
                >
                    <div className="flex items-center gap-4 w-full">
                        <span className="text-[10px] font-bold  w-6 shrink-0">
                            {index}.
                        </span>

                        <h3 className="text-sm font-bold tracking-tight truncate w-[120px] sm:w-32 md:w-64 dark:text-zinc-200">
                            {title}
                        </h3>
                    </div>
                </Button>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        onClick={doDelete}
                        variant="destructive"
                        size="icon"
                        className="bg-none"
                    >
                        <Trash />
                    </Button>

                    <button
                        onClick={doCopy}
                        className={`text-[9px] font-black px-4 py-2 rounded-full transition-all tracking-widest uppercase cursor-pointer ${
                            copied
                                ? "bg-emerald-500 text-white"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        }`}
                    >
                        {copied ? "COPIED" : "Copy"}
                    </button>
                </div>
            </div>

            {/* Custom Accordion Content */}
            <div
                className={`grid transition-all duration-300 ease-in-out ${
                    isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                }`}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4">
                        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed text-zinc-500 dark:text-zinc-400 max-h-96 overflow-y-auto custom-scrollbar">
                                {clip.content}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
