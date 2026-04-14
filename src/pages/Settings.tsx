import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { motion } from "framer-motion";

import { useClipboard } from "../hooks/useClipboard";
import Settings from "../pages/Settings";

export default function SettingsPage() {
    const navigate = useNavigate();

    const {
        dbPath,
        connectToDatabase,
        deleteByRange,
        clearAllHistory,
    } = useClipboard();

    return (
        <div className="max-w-2xl mx-auto p-6 pb-20">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Settings
                    dbPath={dbPath}
                    onBack={() => navigate("/")}
                    onClearHistory={clearAllHistory}
                    onDeleteRange={deleteByRange}
                    onResetApp={async () => {
                        const store = await load("settings.json", {
                            autoSave: true,
                        });
                        await store.clear();
                        window.location.href = "/";
                    }}
                    onSelectFolder={async () => {
                        const selected = await open({
                            directory: true,
                            multiple: false,
                        });

                        if (selected && typeof selected === "string") {
                            await connectToDatabase(selected);
                        }
                    }}
                />
            </motion.div>
        </div>
    );
}