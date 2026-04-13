import { useState } from "react";
import Accordion from "./ui/Accordion";
import ClipItem from "./ClipItem";
import { Clip } from "../App";
import { Layers } from "lucide-react";

interface GroupProps {
    group: Clip[];
    groupIndex: number;
    totalHistoryLength: number;
    onInternalCopy: (t: string) => void;
    onDeleteClip: (id: number) => void;
}

export default function GroupAccordion({
    group,
    groupIndex,
    totalHistoryLength,
    onInternalCopy,
    onDeleteClip,
}: GroupProps) {
    const [isOpen, setIsOpen] = useState(groupIndex === 0);
    const startNum = totalHistoryLength - groupIndex * 20;
    const endNum = Math.max(
        totalHistoryLength - (groupIndex * 20 + group.length - 1),
        1,
    );

    const customTitle = (
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">
            Batch {groupIndex + 1}{" "}
            <span className="text-zinc-400">
                ({startNum}-{endNum})
            </span>
        </span>
    );

    return (
        <div className="mb-4">
            <Accordion
                title={customTitle}
                icon={<Layers size={16} className="text-emerald-500" />}
                isOpen={isOpen}
                onToggle={() => setIsOpen(!isOpen)}
            >
                <div className="space-y-2 mt-2">
                    {group.map((clip, idx) => (
                        <ClipItem
                            key={clip.id}
                            clip={clip}
                            index={totalHistoryLength - (groupIndex * 20 + idx)}
                            onInternalCopy={onInternalCopy}
                            onDeleteClip={onDeleteClip}
                        />
                    ))}
                </div>
            </Accordion>
        </div>
    );
}
