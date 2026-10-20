import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { applyTransform, type TextTransform } from "@/lib/textTransforms";
import type { Clip, CopyResult, Stats } from "@/types";

const PAGE_SIZE = 200;

/**
 * Loads clipboard history from the Rust backend and keeps it in sync. Recording
 * happens in Rust, so the list refreshes whenever the backend reports a change.
 */
export function useClipboard(view: "all" | "pinned", query: string, smartPaste: boolean) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, pinned: 0 });
  const [loading, setLoading] = useState(true);

  const loadedCount = useRef(PAGE_SIZE);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [page, nextStats] = await Promise.all([
        api.listClips(query.trim(), view === "pinned", 0, loadedCount.current),
        api.stats(),
      ]);
      if (id !== requestId.current) return;
      setClips(page.clips);
      setHasMore(page.has_more);
      setStats(nextStats);
    } catch (error) {
      if (id === requestId.current) toast.error(errorMessage(error));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [query, view]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    loadedCount.current = PAGE_SIZE;
    refresh();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = listen("clips-changed", () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 60);
    });
    return () => {
      clearTimeout(timer);
      unlisten.then((stop) => stop());
    };
  }, []);

  const loadMore = useCallback(() => {
    loadedCount.current += PAGE_SIZE;
    return refresh();
  }, [refresh]);

  const reportCopy = (result: CopyResult, label = "Copied to clipboard") => {
    if (result.message) toast.warning(result.message);
    else if (!result.pasted) toast.success(label);
  };

  const copy = useCallback(async (clip: Clip) => {
    try {
      reportCopy(await api.copyClip(clip.id, false));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  /** The primary action: paste into the previous app, or just copy when smart paste is off. */
  const activate = useCallback(
    async (clip: Clip) => {
      try {
        reportCopy(await api.copyClip(clip.id, smartPaste));
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [smartPaste],
  );

  const togglePin = useCallback(async (clip: Clip) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, is_pinned: !c.is_pinned } : c)),
    );
    try {
      const pinned = await api.togglePin(clip.id);
      toast.success(pinned ? "Pinned" : "Unpinned");
    } catch (error) {
      toast.error(errorMessage(error));
      refreshRef.current();
    }
  }, []);

  const remove = useCallback(async (clip: Clip) => {
    setClips((prev) => prev.filter((c) => c.id !== clip.id));
    try {
      await api.deleteClip(clip.id);
    } catch (error) {
      toast.error(errorMessage(error));
      refreshRef.current();
    }
  }, []);

  const transform = useCallback(async (clip: Clip, kind: TextTransform) => {
    try {
      const content = await api.clipContent(clip.id);
      const result = applyTransform(content, kind);
      if (result === null) {
        toast.error("That transform does not apply to this clip.");
        return;
      }
      reportCopy(await api.copyText(result, false), "Transformed text copied");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  return {
    clips,
    hasMore,
    stats,
    loading,
    refresh,
    loadMore,
    copy,
    activate,
    togglePin,
    remove,
    transform,
  };
}
