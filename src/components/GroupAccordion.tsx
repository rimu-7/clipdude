"use client";

import { ChevronDown } from "lucide-react";
import ClipItem from "./ClipItem";
import { Clip, GroupAccordionProps } from "../types"; // FIX: Imported 'Clip' and fixed path

export default function GroupAccordion({
    group,
    groupIndex,
    totalHistoryLength,
    onInternalCopy,
    onDelete,
    isOpen,
    onToggle,
}: GroupAccordionProps) {
    const startNum = totalHistoryLength - groupIndex * 20;
    const endNum = Math.max(
        totalHistoryLength - (groupIndex * 20 + group.length - 1),
        1,
    );

    return (
        <section className="w-full mb-4 border border-border rounded-3xl bg-secondary/70 backdrop-blur-sm transition-colors duration-200 hover:bg-secondary">
            {/* Header */}
            <button
                onClick={onToggle}
                aria-expanded={isOpen}
                className="w-full px-6 py-5 flex items-center justify-between text-left group cursor-pointer"
            >
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-ring">
                    Batch {groupIndex + 1} • ({startNum}-{endNum})
                </span>

                <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${
                        isOpen ? "rotate-180" : "rotate-0"
                    }`}
                />
            </button>

            {/* Content */}
            <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                    isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                }`}
            >
                <div className="overflow-hidden">
                    <div className="px-6 pb-6">
                        <div className="space-y-3">
                            {/* FIX: Changed clip: ClipProps to clip: Clip */}
                            {group.map((clip: Clip, idx: number) => (
                                <ClipItem
                                    key={clip.id}
                                    clip={clip}
                                    index={
                                        totalHistoryLength -
                                        (groupIndex * 20 + idx)
                                    }
                                    onInternalCopy={onInternalCopy}
                                    onDelete={onDelete}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
