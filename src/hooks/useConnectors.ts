import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CatalogAction {
  name: string;
  label: string;
  usage: string;
}

export interface ConnectorStatus {
  connected: boolean;
  accountLogin: string | null;
  enabledActions: string[];
  catalog: { repo: CatalogAction[]; account: CatalogAction[] };
}

const DEFAULT_STATUS: ConnectorStatus = {
  connected: false,
  accountLogin: null,
  enabledActions: [],
  catalog: { repo: [], account: [] },
};

export type ConnectorScope = "repo" | "account" | "all";

export const useConnectors = () => {
  const [status, setStatus] = useState<ConnectorStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [busyScope, setBusyScope] = useState<ConnectorScope | null>(null);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("connectors-manage", { body });
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: "status" });
      setStatus({ ...DEFAULT_STATUS, ...(data as any) });
    } catch {
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("github-oauth-start", {
        body: { returnTo: "/connectors" },
      });
      if (error || !(data as any)?.url) throw new Error(error?.message || "Could not start GitHub sign-in.");
      window.location.href = (data as any).url;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setConnecting(true);
    try {
      await invoke({ action: "disconnect" });
      await refresh();
    } finally {
      setConnecting(false);
    }
  }, [invoke, refresh]);

  const toggle = useCallback(async (tool: string, enabled: boolean) => {
    setBusyTool(tool);
    try {
      const data = await invoke({ action: "toggle", tool, enabled });
      setStatus((s) => ({ ...s, enabledActions: (data as any).enabledActions ?? s.enabledActions }));
    } finally {
      setBusyTool(null);
    }
  }, [invoke]);

  const toggleAll = useCallback(async (scope: ConnectorScope, enabled: boolean) => {
    setBusyScope(scope);
    try {
      const data = await invoke({ action: "toggle_all", scope, enabled });
      setStatus((s) => ({ ...s, enabledActions: (data as any).enabledActions ?? s.enabledActions }));
    } finally {
      setBusyScope(null);
    }
  }, [invoke]);

  return { status, loading, connecting, busyTool, busyScope, connect, disconnect, toggle, toggleAll, refresh };
};
