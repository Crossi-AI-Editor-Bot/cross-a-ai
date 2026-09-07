import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ConnectorStatus {
  connected: boolean;
  accountLogin: string | null;
  githubReadEnabled: boolean;
  githubWriteEnabled: boolean;
}

const DEFAULT_STATUS: ConnectorStatus = {
  connected: false,
  accountLogin: null,
  githubReadEnabled: false,
  githubWriteEnabled: false,
};

export type ConnectorTool = "github:read" | "github:write";

export const useConnectors = () => {
  const [status, setStatus] = useState<ConnectorStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busyTool, setBusyTool] = useState<ConnectorTool | null>(null);

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

  const toggle = useCallback(async (tool: ConnectorTool, enabled: boolean) => {
    setBusyTool(tool);
    try {
      await invoke({ action: "toggle", tool, enabled });
      setStatus((s) => ({
        ...s,
        githubReadEnabled: tool === "github:read" ? enabled : s.githubReadEnabled,
        githubWriteEnabled: tool === "github:write" ? enabled : s.githubWriteEnabled,
      }));
    } finally {
      setBusyTool(null);
    }
  }, [invoke]);

  return { status, loading, connecting, busyTool, connect, disconnect, toggle, refresh };
};
