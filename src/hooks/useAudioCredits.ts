import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVipStatus } from "@/hooks/useVipStatus";

export const useAudioCredits = () => {
  const [audioCredits, setAudioCredits] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const { isUnlimited } = useVipStatus();

  const fetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      try { await supabase.rpc('reset_weekly_audio_credits' as any, { p_user_id: user.id }); } catch {}
      const { data, error } = await supabase
        .from('user_audio_credits' as any).select('credits').eq('user_id', user.id).maybeSingle();
      if (error || !data) {
        await supabase.from('user_audio_credits' as any).insert({ user_id: user.id, credits: 10 } as any);
        setAudioCredits(10);
      } else {
        setAudioCredits(Number((data as any).credits));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetch();
    const { data } = supabase.auth.onAuthStateChange(() => fetch());
    return () => data.subscription.unsubscribe();
  }, []);

  return { audioCredits, loading, refetch: fetch, isUnlimited, updateAudioCredits: setAudioCredits };
};