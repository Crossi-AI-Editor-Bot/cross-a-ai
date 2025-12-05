import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useVipStatus = () => {
  const [isVip, setIsVip] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkVipStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsVip(false);
          setLoading(false);
          return;
        }

        // Check if user is admin (admins are always VIP)
        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminData) {
          setIsVip(true);
          setLoading(false);
          return;
        }

        // Check for active VIP status
        const { data: vipData } = await supabase
          .from("vip_status")
          .select("expires_at")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        setIsVip(!!vipData);
      } catch (error) {
        console.error("Error checking VIP status:", error);
        setIsVip(false);
      } finally {
        setLoading(false);
      }
    };

    checkVipStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkVipStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isVip, loading };
};
