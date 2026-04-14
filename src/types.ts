export interface Clip {
    id: number;
    content: string;
    created_at?: string;
}

export interface GroupAccordionProps {
    group: Clip[];
    groupIndex: number;
    totalHistoryLength: number;
    onInternalCopy: (text: string) => Promise<void>;
    onDelete: (id: number) => Promise<void> | void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export interface ClipItemProps {
    clip: Clip;
    index: number;
    onInternalCopy: (text: string) => Promise<void>;
    onDelete: (id: number) => void | Promise<void>;
}
