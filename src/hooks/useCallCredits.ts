import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useCallCredits = () => {
  const [callCredits, setCallCredits] = useState<number>(100);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCallCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Try to reset weekly credits first
      try {
        await (supabase.rpc as any)('reset_weekly_call_credits', { p_user_id: user.id });
      } catch {
        // Ignore errors from reset
      }

      const { data, error } = await (supabase.from('user_call_credits') as any)
        .select('credits, last_reset_date')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const { data: newData, error: insertError } = await (supabase.from('user_call_credits') as any)
            .insert({ user_id: user.id, credits: 100 })
            .select('credits')
            .single();

          if (!insertError && newData) {
            setCallCredits(newData.credits);
          }
        }
      } else if (data) {
        setCallCredits(data.credits);
      }
    } catch (error) {
      console.error('Error fetching call credits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallCredits();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchCallCredits();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const updateCallCredits = (newCredits: number) => {
    setCallCredits(newCredits);
  };

  return { callCredits, loading, updateCallCredits, refetch: fetchCallCredits };
};
