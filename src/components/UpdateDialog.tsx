import { Fragment, type ReactNode } from "react";
import { AlertDialog as Dialog } from "radix-ui";
import { CheckCircle2, Download, ExternalLink, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/api";
import { downloadPercent } from "@/hooks/useUpdates";
import type { UpdateStatus } from "@/types";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UpdateStatus;
  onInstall: () => void;
  onCheck: () => void;
  onSkip: (version: string) => void;
  onOpenReleasePage: (version: string | null) => void;
}

export default function UpdateDialog({
  open, onOpenChange, status, onInstall, onCheck, onSkip, onOpenReleasePage,
}: UpdateDialogProps) {
  const busy = status.phase === "downloading" || status.phase === "installing";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <Dialog.Cancel asChild>
            <button
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Cancel>
          <Body
            status={status}
            busy={busy}
            onInstall={onInstall}
            onCheck={onCheck}
            onSkip={onSkip}
            onOpenReleasePage={onOpenReleasePage}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({
  status, busy, onInstall, onCheck, onSkip, onOpenReleasePage, onClose,
}: Omit<UpdateDialogProps, "open" | "onOpenChange"> & { busy: boolean; onClose: () => void }) {
  if (status.phase === "checking" || status.phase === "idle") {
    return (
      <Centered icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} title="Checking for updates…">
        Looking for a newer version of ClipDude.
      </Centered>
    );
  }

  if (status.phase === "up_to_date") {
    return (
      <Centered icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} title="You're up to date">
        ClipDude {status.current_version} is the latest version.
        <div className="mt-5 flex justify-center">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Centered>
    );
  }

  if (status.phase === "error" && !status.version) {
    return (
      <Centered icon={<TriangleAlert className="h-6 w-6 text-amber-500" />} title="Couldn't check for updates">
        {status.error}
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenReleasePage(null)}>
            <ExternalLink /> Releases Page
          </Button>
          <Button onClick={onCheck}>Try Again</Button>
        </div>
      </Centered>
    );
  }

  const version = status.version ?? "";
  const percent = downloadPercent(status);
  const notes = releaseNotes(status.notes);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Sparkles className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <Dialog.Title className="text-base font-bold">ClipDude {version} is available</Dialog.Title>
          <Dialog.Description className="text-xs text-muted-foreground">
            You have {status.current_version}
            {status.date ? ` · Released ${new Date(status.date).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}
          </Dialog.Description>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed">
        {notes ? <Markdown text={notes} /> : <p className="text-muted-foreground">Bug fixes and improvements.</p>}
      </div>

      {busy && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width] duration-200",
                (percent === null || status.phase === "installing") && "w-1/3 animate-pulse",
              )}
              style={percent !== null && status.phase === "downloading" ? { width: `${percent}%` } : undefined}
            />
          </div>
          <p className="text-[11px] font-mono text-muted-foreground tabular-nums">
            {status.phase === "installing"
              ? "Installing… ClipDude will restart in a moment."
              : status.total
                ? `Downloading ${formatBytes(status.downloaded)} of ${formatBytes(status.total)} (${percent}%)`
                : `Downloading ${formatBytes(status.downloaded)}…`}
          </p>
        </div>
      )}

      {status.phase === "error" && status.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {status.error} You can also download it from the releases page.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSkip(version)} className="text-muted-foreground">
          Skip This Version
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenReleasePage(version)} className="text-muted-foreground">
          <ExternalLink /> View on GitHub
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {busy ? "Hide" : "Later"}
          </Button>
          <Button onClick={onInstall} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {status.phase === "error" ? "Retry Install" : busy ? "Updating…" : "Install & Restart"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Centered({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">{icon}</div>
      <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
      <Dialog.Description asChild>
        <div className="mt-1 text-xs text-muted-foreground">{children}</div>
      </Dialog.Description>
    </div>
  );
}

/** The release body is notes, a `---` line, then install instructions for the GitHub page. */
function releaseNotes(notes: string | null): string | null {
  if (!notes) return null;
  const [summary] = notes.split(/^\s*---\s*$/m);
  return summary.trim() || null;
}

/** Renders the small Markdown subset used in release notes, without injecting HTML. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5 marker:text-primary/70">
        {bullets.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (heading) {
      blocks.push(
        <p key={blocks.length} className="mt-2 first:mt-0 text-[11px] font-bold uppercase tracking-widest text-foreground">
          {inline(heading[1])}
        </p>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length} className="my-1">{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (link) return <Fragment key={i}>{link[1]}</Fragment>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
