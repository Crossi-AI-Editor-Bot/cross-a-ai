import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AddonToolParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface AddonToolDef {
  name: string;
  file: string;
  description?: string;
  parameters?: AddonToolParam[];
}

export interface Addon {
  id: string;
  name: string;
  prefix: string;
  version: string | null;
  description: string | null;
  author_name: string | null;
  tools: AddonToolDef[];
  dependencies: { id: string }[];
  install_count: number;
  created_at: string;
  updated_at: string;
}

interface State {
  addons: Addon[];
  installedIds: string[];
  loading: boolean;
}

export const useAddons = () => {
  const [state, setState] = useState<State>({ addons: [], installedIds: [], loading: true });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.functions.invoke("addons-manage", {
      body: { action: "list" },
    });
    if (error) {
      console.error("Failed to load addons:", error);
      setState({ addons: [], installedIds: [], loading: false });
      return;
    }
    setState({
      addons: ((data as any)?.addons ?? []) as Addon[],
      installedIds: ((data as any)?.installedIds ?? []) as string[],
      loading: false,
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("addons-manage", { body });
    if (error) {
      const ctx = (error as any)?.context;
      let msg = error.message;
      try {
        if (ctx?.json) { const j = await ctx.json(); if (j?.error) msg = j.error; }
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }, []);

  const install = useCallback(async (addonId: string) => {
    setBusyId(addonId);
    try {
      await invoke({ action: "install", addonId });
      setState((s) => ({ ...s, installedIds: [...new Set([...s.installedIds, addonId])] }));
    } finally {
      setBusyId(null);
    }
  }, [invoke]);

  const uninstall = useCallback(async (addonId: string) => {
    setBusyId(addonId);
    try {
      await invoke({ action: "uninstall", addonId });
      setState((s) => ({ ...s, installedIds: s.installedIds.filter((id) => id !== addonId) }));
    } finally {
      setBusyId(null);
    }
  }, [invoke]);

  const remove = useCallback(async (addonId: string) => {
    setBusyId(addonId);
    try {
      await invoke({ action: "delete", addonId });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [invoke, refresh]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(binary);
      const result = await invoke({ action: "upload", fileBase64 });
      await refresh();
      return result;
    } finally {
      setUploading(false);
    }
  }, [invoke, refresh]);

  return { ...state, busyId, uploading, install, uninstall, remove, upload, refresh };
};
