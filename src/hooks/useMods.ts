import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModId = "text-size" | "credit-recolor" | "copy" | "app-style" | "like-dislike";

export const ALL_MODS: { id: ModId; name: string; description: string }[] = [
  { id: "text-size", name: "Text-Size-Changer", description: "Change the font size of the entire website." },
  { id: "credit-recolor", name: "Credit-Recolor", description: "Recolor the audio, image and video credit pills." },
  { id: "copy", name: "Copy", description: "Adds a copy button to AI answers and your prompts." },
  { id: "app-style", name: "App-Style", description: "Change the app background and accent color — pick a preset or your own." },
  { id: "like-dislike", name: "Like/Dislike", description: "Rate AI messages — disliking regenerates the reply with a 50% credit discount." },
];

export type AppStylePreset = "classic" | "crossatrix" | "custom";

export interface ModSettings {
  fontSize?: number; // px, default 16
  creditColors?: { audio?: string; image?: string; video?: string };
  appStyle?: {
    preset?: AppStylePreset;
    /** HSL triplets like "220 80% 12%" — only used when preset === "custom" */
    bg?: string;
    accent?: string;
  };
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
    await supabase.from("user_mods").upsert([{
      user_id: user.id,
      installed: merged.installed,
      settings: merged.settings as any,
      updated_at: new Date().toISOString(),
    }]);
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

/** HSL triplet presets for the App-Style mod. */
export const APP_STYLE_PRESETS: Record<Exclude<AppStylePreset, "custom">, { label: string; bg: string; accent: string }> = {
  classic: { label: "Classic", bg: "", accent: "" },
  crossatrix: { label: "Modern Crossatrix Style", bg: "220 80% 12%", accent: "45 100% 55%" },
};

/** Applies font-size + app-style mods globally. */
export const ModsApplier = () => {
  const { installed, settings } = useMods();
  useEffect(() => {
    const size = installed.includes("text-size") ? (settings.fontSize ?? 16) : 16;
    document.documentElement.style.fontSize = `${size}px`;
  }, [installed, settings.fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    const OVERRIDES = [
      "--background", "--foreground",
      "--card", "--card-foreground",
      "--popover", "--popover-foreground",
      "--muted", "--muted-foreground",
      "--secondary", "--secondary-foreground",
      "--border", "--input",
      "--primary", "--primary-foreground",
      "--accent", "--accent-foreground",
      "--ring",
      "--gradient-primary", "--gradient-subtle",
    ];
    const clear = () => {
      OVERRIDES.forEach((p) => root.style.removeProperty(p));
    };
    if (!installed.includes("app-style")) { clear(); return; }
    const cfg = settings.appStyle ?? { preset: "classic" };
    let bg = "", accent = "";
    if (cfg.preset === "custom") { bg = cfg.bg ?? ""; accent = cfg.accent ?? ""; }
    else if (cfg.preset && cfg.preset !== "classic") {
      const p = APP_STYLE_PRESETS[cfg.preset]; bg = p.bg; accent = p.accent;
    }
    clear();
    // Parse "H S% L%" triplet; return null if invalid.
    const parse = (v: string): [number, number, number] | null => {
      const m = v.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const hsl = (h: number, s: number, l: number) =>
      `${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%`;

    if (bg) {
      const parsed = parse(bg);
      const isDark = parsed ? parsed[2] < 50 : false;
      const [h, s] = parsed ?? [220, 20];
      const baseL = parsed?.[2] ?? 98;
      // Backgrounds/surfaces derived from bg — page bg gets accent color, not buttons.
      root.style.setProperty("--background", bg);
      root.style.setProperty("--foreground", isDark ? "0 0% 98%" : "220 15% 15%");
      const surfaceL = isDark ? Math.min(baseL + 4, 30) : Math.max(baseL - 2, 92);
      const mutedL   = isDark ? Math.min(baseL + 6, 32) : Math.max(baseL - 4, 90);
      const borderL  = isDark ? Math.min(baseL + 10, 40) : Math.max(baseL - 8, 82);
      root.style.setProperty("--card", hsl(h, s * 0.5, surfaceL));
      root.style.setProperty("--card-foreground", isDark ? "0 0% 98%" : "220 15% 15%");
      root.style.setProperty("--popover", hsl(h, s * 0.5, surfaceL));
      root.style.setProperty("--popover-foreground", isDark ? "0 0% 98%" : "220 15% 15%");
      root.style.setProperty("--muted", hsl(h, s * 0.4, mutedL));
      root.style.setProperty("--muted-foreground", isDark ? "0 0% 70%" : "220 10% 40%");
      root.style.setProperty("--secondary", hsl(h, s * 0.4, mutedL));
      root.style.setProperty("--secondary-foreground", isDark ? "0 0% 95%" : "220 15% 20%");
      root.style.setProperty("--border", hsl(h, s * 0.3, borderL));
      root.style.setProperty("--input", hsl(h, s * 0.3, borderL));
      root.style.setProperty("--gradient-subtle", `linear-gradient(180deg, hsl(${bg}), hsl(${hsl(h, s, surfaceL)}))`);
    }
    if (accent) {
      const parsed = parse(accent);
      const accL = parsed?.[2] ?? 50;
      // Accent drives icons + buttons.
      root.style.setProperty("--primary", accent);
      root.style.setProperty("--primary-foreground", accL > 60 ? "220 15% 10%" : "0 0% 100%");
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-foreground", accL > 60 ? "220 15% 10%" : "0 0% 100%");
      root.style.setProperty("--ring", accent);
      root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${accent}), hsl(${accent}))`);
    }
  }, [installed, settings.appStyle]);
  return null;
};
