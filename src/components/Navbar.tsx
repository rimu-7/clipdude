import { Moon, Sun, Settings } from "lucide-react";

interface NavbarProps {
    isDark: boolean;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
    currentPath: string;
}

export default function Navbar({
    isDark,
    onToggleTheme,
    onOpenSettings,
    currentPath,
}: NavbarProps) {
    return (
        <header className="flex justify-between items-center py-6 border-b border-zinc-100 dark:border-zinc-900 sticky top-0 backdrop-blur-md z-50">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <h1 className="text-xl font-black tracking-tighter italic uppercase select-none text-zinc-900 dark:text-zinc-100">
                    ClipDude
                </h1>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={onToggleTheme}
                    className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 transition-all hover:border-emerald-500 active:scale-90 cursor-pointer"
                    aria-label="Toggle theme"
                >
                    {isDark ? (
                        <Sun className="w-5 h-5 stroke-current" />
                    ) : (
                        <Moon className="w-5 h-5 stroke-current" />
                    )}
                </button>

                <button
                    onClick={onOpenSettings}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-90 cursor-pointer ${
                        currentPath === "settings"
                            ? "border-emerald-500 text-white"
                            : "border-zinc-200 dark:border-zinc-800 dark:text-white hover:border-emerald-500"
                    }`}
                    aria-label="Open settings"
                >
                    <Settings className="w-5 h-5 stroke-current" />
                </button>
            </div>
        </header>
    );
}
