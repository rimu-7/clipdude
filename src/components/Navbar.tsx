import { memo } from "react";
import { Moon, Sun, Settings } from "lucide-react";

interface NavbarProps {
    isDark: boolean;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
    currentPath: string;
}

const Navbar = memo(({
    isDark,
    onToggleTheme,
    onOpenSettings,
    currentPath,
}: NavbarProps) => {
    return (
        <header className="flex justify-between items-center py-6 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-50 transition-colors duration-300">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)] shrink-0" />
                
                {/* FIX: Replaced <a> with a <button> to prevent hard app reloads.
                  If the user clicks the logo while in settings, it takes them back home. 
                */}
                <button
                    onClick={() => currentPath === "settings" && onOpenSettings()}
                    className="text-xl font-black tracking-tighter italic uppercase select-none hover:text-emerald-500 transition-colors cursor-pointer"
                >
                    ClipDude
                </button>
            </div>

            <div className="flex items-center gap-2">
                {/* THEME TOGGLE */}
                <button
                    onClick={onToggleTheme}
                    className="w-10 h-10 flex items-center justify-center rounded-xl border border-border bg-background transition-all hover:border-emerald-500 hover:text-emerald-500 active:scale-95 cursor-pointer"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                    {isDark ? (
                        <Sun className="w-5 h-5 stroke-current" />
                    ) : (
                        <Moon className="w-5 h-5 stroke-current" />
                    )}
                </button>

                {/* SETTINGS TOGGLE */}
                <button
                    onClick={onOpenSettings}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer ${
                        currentPath === "settings"
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20"
                            : "border-border bg-background hover:border-emerald-500 hover:text-emerald-500"
                    }`}
                    aria-label="Toggle settings"
                >
                    <Settings className="w-5 h-5 stroke-current" />
                </button>
            </div>
        </header>
    );
});

Navbar.displayName = "Navbar";

export default Navbar;