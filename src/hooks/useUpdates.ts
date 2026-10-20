import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { UpdateStatus } from "@/types";

/** Live update status. Checks and downloads run in Rust and stream their progress here. */
export function useUpdates(initial: UpdateStatus) {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    const unlisten = listen<UpdateStatus>("update-status", (event) => setStatus(event.payload));
    // Catch anything that changed between bootstrap and subscribing.
    api.updateStatus().then(setStatus).catch(() => {});
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const check = useCallback(async () => {
    try {
      const next = await api.checkForUpdate();
      setStatus(next);
      return next;
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    }
  }, []);

  const install = useCallback(async () => {
    try {
      await api.installUpdate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  const openReleasePage = useCallback(async (version: string | null) => {
    try {
      await api.openReleasePage(version);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  return { status, check, install, openReleasePage };
}

export function downloadPercent(status: UpdateStatus): number | null {
  if (!status.total) return null;
  return Math.min(100, Math.round((status.downloaded / status.total) * 100));
}

export function relativeTime(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
