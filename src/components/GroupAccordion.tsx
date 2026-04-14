import { Clip } from "../App";
import ClipItem from "./ClipItem";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

export default function GroupAccordion({
    group,
    groupIndex,
    totalHistoryLength,
    onInternalCopy,
    onDelete,
}: any) {
    const startNum = totalHistoryLength - groupIndex * 20;
    const endNum = Math.max(
        totalHistoryLength - (groupIndex * 20 + group.length - 1),
        1,
    );
    const batchId = `batch-${groupIndex}`;

    return (
        <Accordion
            type="single"
            collapsible
            defaultValue={groupIndex === 0 ? batchId : undefined}
            className="w-full mb-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-3xl"
        >
            <AccordionItem value={batchId} className="border-b-0 px-6">
                <AccordionTrigger className="hover:no-underline text-[10px] font-black uppercase tracking-[0.3em] text-ring py-5">
                    Batch {groupIndex + 1} • ({startNum}-{endNum})
                </AccordionTrigger>

                {/* FIX: Ensure the content can grow naturally without getting clipped */}
                <AccordionContent className="pb-6">
                    <Accordion
                        type="single"
                        collapsible
                        className="w-full space-y-3 px-2 flex flex-col"
                    >
                        {group.map((clip: Clip, idx: number) => (
                            <ClipItem
                                key={clip.id}
                                clip={clip}
                                index={
                                    totalHistoryLength - (groupIndex * 20 + idx)
                                }
                                onInternalCopy={onInternalCopy}
                                onDelete={onDelete}
                            />
                        ))}
                    </Accordion>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
