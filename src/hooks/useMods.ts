import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModId = "text-size" | "credit-recolor" | "copy";

export const ALL_MODS: { id: ModId; name: string; description: string }[] = [
  { id: "text-size", name: "Text-Size-Changer", description: "Change the font size of the entire website." },
  { id: "credit-recolor", name: "Credit-Recolor", description: "Recolor the audio, image and video credit pills." },
  { id: "copy", name: "Copy", description: "Adds a copy button to AI answers and your prompts." },
];

export interface ModSettings {
  fontSize?: number; // px, default 16
  creditColors?: { audio?: string; image?: string; video?: string };
}

interface State {
  installed: ModId[];
  settings: ModSettings;
  loading: boolean;
}

let cache: State = { installed: [], settings: {}, loading: true };
const listeners = new Set<(s: State) => void>();
const setState = (s: State) => {
  cache = s;
  listeners.forEach((l) => l(s));
};

let loaded = false;
const ensureLoaded = async () => {
  if (loaded) return;
  loaded = true;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    setState({ installed: [], settings: {}, loading: false });
    return;
  }
  const { data } = await supabase.from("user_mods").select("installed, settings").eq("user_id", user.id).maybeSingle();
  setState({
    installed: (data?.installed as ModId[]) || [],
    settings: (data?.settings as ModSettings) || {},
    loading: false,
  });
};

supabase.auth.onAuthStateChange(() => {
  loaded = false;
  ensureLoaded();
});

export const useMods = () => {
  const [state, setLocal] = useState<State>(cache);

  useEffect(() => {
    listeners.add(setLocal);
    ensureLoaded();
    return () => { listeners.delete(setLocal); };
  }, []);

  const persist = useCallback(async (next: { installed?: ModId[]; settings?: ModSettings }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const merged = {
      installed: next.installed ?? cache.installed,
      settings: next.settings ?? cache.settings,
    };
    setState({ ...merged, loading: false });
    await supabase.from("user_mods").upsert({
      user_id: user.id,
      installed: merged.installed,
      settings: merged.settings,
      updated_at: new Date().toISOString(),
    });
  }, []);

  const toggleMod = useCallback((id: ModId) => {
    const installed = cache.installed.includes(id)
      ? cache.installed.filter((m) => m !== id)
      : [...cache.installed, id];
    persist({ installed });
  }, [persist]);

  const updateSettings = useCallback((patch: ModSettings) => {
    persist({ settings: { ...cache.settings, ...patch } });
  }, [persist]);

  return { ...state, toggleMod, updateSettings, has: (id: ModId) => state.installed.includes(id) };
};

/** Applies font-size mod globally. */
export const ModsApplier = () => {
  const { installed, settings } = useMods();
  useEffect(() => {
    const size = installed.includes("text-size") ? (settings.fontSize ?? 16) : 16;
    document.documentElement.style.fontSize = `${size}px`;
  }, [installed, settings.fontSize]);
  return null;
};
