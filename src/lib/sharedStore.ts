import { useEffect, useState } from "react";
import { onUserChange } from "@/lib/authUser";

/**
 * One fetch shared by every component that needs the same data.
 * Deduplicates concurrent calls, caches for `ttlMs`, and refetches
 * only when the signed-in user changes.
 */
export function createSharedStore<T>(
  fetcher: () => Promise<T>,
  initial: T,
  options: { ttlMs?: number; resetOnUserChange?: boolean } = {},
) {
  const ttlMs = options.ttlMs ?? 60_000;
  let value: T = initial;
  let loading = true;
  let lastFetch = 0;
  let inflight: Promise<void> | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());

  const load = (force = false): Promise<void> => {
    if (inflight) return inflight;
    if (!force && lastFetch && Date.now() - lastFetch < ttlMs) return Promise.resolve();
    inflight = fetcher()
      .then((v) => {
        value = v;
      })
      .catch((e) => {
        console.error("sharedStore fetch failed:", e);
      })
      .finally(() => {
        lastFetch = Date.now();
        loading = false;
        inflight = null;
        emit();
      });
    return inflight;
  };

  const set = (v: T) => {
    value = v;
    loading = false;
    emit();
  };

  if (options.resetOnUserChange !== false) {
    onUserChange(() => {
      lastFetch = 0;
      if (subs.size > 0) load(true);
    });
  }

  const useStore = () => {
    const [state, setState] = useState({ value, loading });
    useEffect(() => {
      const cb = () => setState({ value, loading });
      subs.add(cb);
      load();
      cb();
      return () => {
        subs.delete(cb);
      };
    }, []);
    return state;
  };

  return {
    useStore,
    load,
    set,
    get: () => value,
    refetch: () => load(true),
  };
}
