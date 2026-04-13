import { useState } from "react";
import { motion } from "framer-motion";
import Accordion from "../components/Accordion";

interface SettingsProps {
    dbPath: string | null;
    onSelectFolder: () => void;
    onBack: () => void;
    onClearHistory: () => void;
    onResetApp: () => void;
    onDeleteRange: (range: "day" | "week" | "month") => void; // New Prop
}

export default function Settings({
    dbPath,
    onSelectFolder,
    onBack,
    onClearHistory,
    onResetApp,
    onDeleteRange,
}: SettingsProps) {
    const [openSection, setOpenSection] = useState<string | null>("storage");

    const toggle = (id: string) =>
        setOpenSection(openSection === id ? null : id);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-6 space-y-6"
        >
            {/* Back Button */}
            <button onClick={onBack} className="...">
                {" "}
                ...{" "}
            </button>

            <div className="space-y-4">
                {/* 1. Storage Configuration (Keep as is) */}
                <Accordion
                    id="storage"
                    title="Storage"
                    icon="📁"
                    isOpen={openSection === "storage"}
                    onToggle={() => toggle("storage")}
                >
                    {/* ... existing storage content ... */}
                </Accordion>

                {/* 2. NEW: Selective Cleanup Accordion */}
                <Accordion
                    id="cleanup"
                    title="History Cleanup"
                    icon="🧹"
                    isOpen={openSection === "cleanup"}
                    onToggle={() => toggle("cleanup")}
                >
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                            Delete Older Than:
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <RangeButton
                                label="24 Hours"
                                onClick={() => onDeleteRange("day")}
                            />
                            <RangeButton
                                label="7 Days"
                                onClick={() => onDeleteRange("week")}
                            />
                            <RangeButton
                                label="30 Days"
                                onClick={() => onDeleteRange("month")}
                            />
                        </div>
                        <p className="text-[9px] text-zinc-400 italic">
                            This will keep your most recent clips and remove the
                            rest.
                        </p>
                    </div>
                </Accordion>

                {/* 3. Danger Zone (Keep as is) */}
                <Accordion
                    id="danger"
                    title="Danger Zone"
                    icon="⚠️"
                    isOpen={openSection === "danger"}
                    onToggle={() => toggle("danger")}
                    variant="danger"
                >
                    {/* ... existing danger content ... */}
                </Accordion>
            </div>
        </motion.div>
    );
}

// Small helper component for the range buttons
function RangeButton({
    label,
    onClick,
}: {
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="py-2.5 px-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-[9px] font-black rounded-xl uppercase transition-all active:scale-95 cursor-pointer border border-zinc-200 dark:border-zinc-700"
        >
            {label}
        </button>
    );
}
