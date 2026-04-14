import { Routes, Route, Navigate } from "react-router-dom";

import SettingsPage from "./pages/Settings";
import MonitorPage from "./pages/MonitorPage";


export default function App() {
    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300 selection:bg-primary/20">
            <Routes>
                <Route path="/" element={<MonitorPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
