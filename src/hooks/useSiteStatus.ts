import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SiteStatus {
  disabled_until: string | null;
}

export const useSiteStatus = () => {
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSiteStatus();
  }, []);

  const fetchSiteStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "site_status")
        .maybeSingle();

      if (error) throw error;
      
      if (data?.value) {
        setSiteStatus(data.value as unknown as SiteStatus);
      }
    } catch (error) {
      console.error("Error fetching site status:", error);
    } finally {
      setLoading(false);
    }
  };

  const disableSite = async (days: number = 1): Promise<boolean> => {
    try {
      const disabledUntil = new Date();
      disabledUntil.setDate(disabledUntil.getDate() + days);

      const { error } = await supabase
        .from("site_settings")
        .update({ 
          value: { disabled_until: disabledUntil.toISOString() },
          updated_at: new Date().toISOString()
        })
        .eq("key", "site_status");

      if (error) throw error;
      
      setSiteStatus({ disabled_until: disabledUntil.toISOString() });
      return true;
    } catch (error) {
      console.error("Error disabling site:", error);
      return false;
    }
  };

  const enableSite = async (): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({ 
          value: { disabled_until: null },
          updated_at: new Date().toISOString()
        })
        .eq("key", "site_status");

      if (error) throw error;
      
      setSiteStatus({ disabled_until: null });
      return true;
    } catch (error) {
      console.error("Error enabling site:", error);
      return false;
    }
  };

  const isDisabled = (): boolean => {
    if (!siteStatus?.disabled_until) return false;
    return new Date(siteStatus.disabled_until) > new Date();
  };

  const getDisabledUntil = (): Date | null => {
    if (!siteStatus?.disabled_until) return null;
    return new Date(siteStatus.disabled_until);
  };

  return {
    loading,
    isDisabled: isDisabled(),
    disabledUntil: getDisabledUntil(),
    disableSite,
    enableSite,
    refetch: fetchSiteStatus,
  };
};
