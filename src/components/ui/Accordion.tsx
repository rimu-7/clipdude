import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
    id?: string;
    title: string | ReactNode;
    icon?: ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
    variant?: "default" | "danger";
}

export default function Accordion({
    title,
    icon,
    isOpen,
    onToggle,
    children,
    variant = "default",
}: AccordionProps) {
    return (
        <div
            className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                isOpen
                    ? "border-zinc-300 dark:border-zinc-700 shadow-md"
                    : "border-zinc-200 dark:border-zinc-800 shadow-sm"
            } ${variant === "danger" ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50" : "bg-white dark:bg-zinc-900/50"}`}
        >
            <button
                onClick={onToggle}
                className={`w-full px-5 py-4 flex items-center justify-between text-sm font-bold cursor-pointer group transition-colors ${
                    variant === "danger"
                        ? "text-red-600 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-900/20"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
            >
                <span className="flex items-center gap-3">
                    {icon && (
                        <span className="text-lg opacity-70 group-hover:opacity-100 transition-opacity">
                            {icon}
                        </span>
                    )}
                    <span className="dark:text-zinc-200 tracking-tight text-left">
                        {title}
                    </span>
                </span>

                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    className={
                        variant === "danger"
                            ? "text-red-400"
                            : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200"
                    }
                >
                    <ChevronDown size={16} />
                </motion.span>
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            duration: 0.3,
                            ease: [0.04, 0.62, 0.23, 0.98],
                        }}
                    >
                        <div
                            className={`px-5 pb-5 pt-2 border-t ${variant === "danger" ? "border-red-100 dark:border-red-900/30" : "border-zinc-100 dark:border-zinc-800/50"}`}
                        >
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
