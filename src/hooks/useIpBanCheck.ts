import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useIpBanCheck = () => {
  const [isBanned, setIsBanned] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBan = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-ip-ban");
        if (!error && data?.banned) {
          setIsBanned(true);
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
