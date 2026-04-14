
import { Button } from "@/components/ui/button";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { BrushCleaning, File, TriangleAlert } from "lucide-react";
import { exit } from "@tauri-apps/plugin-process";

export default function SettingsPage({
    dbPath,
    onSelectFolder,
    onBack,
    onClearHistory,
    onResetApp,
    onDeleteRange,
}: any) {
    return (
        <div className="py-6 space-y-6">
            <Button
                variant="ghost"
                onClick={onBack}
                className="text-zinc-400 hover:text-emerald-500 text-[10px] font-black uppercase tracking-widest -ml-4"
            >
                ← Return to HomePage
            </Button>

            <Accordion
                type="multiple"
                defaultValue={["storage", "cleanup"]}
                className="space-y-4"
            >
                {/* Storage */}
                <AccordionItem
                    value="storage"
                    className="border border-border rounded-2xl px-5 bg-background shadow-sm"
                >
                    <AccordionTrigger className="hover:no-underline text-sm font-bold">
                        <span className="flex items-center gap-3">
                            <File className="w-5 h-5" /> Storage Configuration
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-5">
                        <div className="p-3 bg-muted rounded-xl border border-border break-all text-[10px] font-mono text-muted-foreground">
                            {dbPath || "No path selected"}
                        </div>
                        <Button
                            onClick={onSelectFolder}
                            className="w-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
                        >
                            Move Database
                        </Button>
                    </AccordionContent>
                </AccordionItem>

                {/* Range Cleanup */}
                <AccordionItem
                    value="cleanup"
                    className="border border-border rounded-2xl px-5 bg-background shadow-sm"
                >
                    <AccordionTrigger className="hover:no-underline text-sm font-bold">
                        <span className="flex items-center gap-3">
                            <BrushCleaning className="w-5 h-5" /> History
                            Cleanup
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                            Delete Older Than:
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onDeleteRange("day")}
                                className="text-[10px] font-bold uppercase"
                            >
                                24 Hours
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => onDeleteRange("week")}
                                className="text-[10px] font-bold uppercase"
                            >
                                7 Days
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => onDeleteRange("month")}
                                className="text-[10px] font-bold uppercase"
                            >
                                30 Days
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                
                {/* Danger Zone */}
                        <AccordionItem value="danger" className="border border-destructive/30 rounded-2xl px-5 bg-destructive/5">
                          <AccordionTrigger className="hover:no-underline text-sm font-bold text-destructive">
                            <span className="flex items-center gap-3">⚠️ Danger Zone</span>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-3 pb-5">
                            <Button variant="outline" onClick={onClearHistory} className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase tracking-widest">
                              Clear All History
                            </Button>
                            <Button variant="destructive" onClick={onResetApp} className="w-full text-[10px] font-black uppercase tracking-widest">
                              Reset All Settings
                            </Button>
                            
                            <div className="w-full h-px bg-destructive/20 my-2" /> {/* Divider */}
                
                            {/* NEW: HARD CLOSE BUTTON */}
                            <Button 
                              onClick={async () => await exit(0)} 
                              className="w-full text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                            >
                              Hard Close ClipDude
                            </Button>
                
                          </AccordionContent>
                        </AccordionItem>

                {/* Danger Zone */}
                <AccordionItem
                    value="danger"
                    className="border border-destructive/30 rounded-2xl px-5 bg-destructive/5"
                >
                    <AccordionTrigger className="hover:no-underline text-sm font-bold text-destructive">
                        <span className="flex items-center gap-3">
                            <TriangleAlert className="w-5 h-5" /> Danger Zone
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-5">
                        <Button
                            variant="outline"
                            onClick={onClearHistory}
                            className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase tracking-widest"
                        >
                            Clear All History
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={onResetApp}
                            className="w-full text-[10px] font-black uppercase tracking-widest"
                        >
                            Reset All Settings
                        </Button>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
