import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the signed-in user id from the locally cached session.
 * Avoids a network round-trip per call (unlike auth.getUser()).
 */
export const getUserId = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
};

/**
 * Fires only when the signed-in user actually changes.
 * Token refreshes and repeated INITIAL_SESSION events are ignored.
 */
export const onUserChange = (cb: (userId: string | null) => void) => {
  let last: string | null | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id ?? null;
    if (last !== undefined && id === last) return;
    last = id;
    cb(id);
  });
  return () => data.subscription.unsubscribe();
};

/**
 * Runs a task at most once per key per period (default: once a day, per browser).
 * Used to avoid re-triggering credit-reset RPCs on every page load.
 */
export const runThrottled = async (key: string, fn: () => unknown, periodMs = 12 * 60 * 60 * 1000) => {
  try {
    const stamp = Number(localStorage.getItem(`throttle:${key}`) || 0);
    if (Date.now() - stamp < periodMs) return;
    localStorage.setItem(`throttle:${key}`, String(Date.now()));
  } catch {
    // localStorage unavailable — just run it
  }
  try {
    await fn();
  } catch {
    // ignore
  }
};
