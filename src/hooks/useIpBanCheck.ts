import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "ip-ban-check";
const TTL_MS = 30 * 60 * 1000;

type Cached = { banned: boolean; at: number };

const readCache = (): Cached | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return Date.now() - parsed.at < TTL_MS ? parsed : null;
  } catch {
    return null;
  }
};

export const useIpBanCheck = () => {
  const cached = readCache();
  const [isBanned, setIsBanned] = useState(cached?.banned ?? false);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    const checkBan = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-ip-ban");
        const banned = !error && !!data?.banned;
        setIsBanned(banned);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ banned, at: Date.now() } as Cached));
        } catch {
          // ignore
        }
      } catch {
        // If check fails, allow access
      } finally {
        setLoading(false);
      }
    };
    checkBan();
  }, []);

  return { isBanned, loading };
};
