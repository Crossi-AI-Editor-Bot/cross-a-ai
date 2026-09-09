import { supabase } from "@/integrations/supabase/client";
import { useVipStatus } from "@/hooks/useVipStatus";
import { getUserId, runThrottled } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

const audioCreditsStore = createSharedStore<number>(async () => {
  const userId = await getUserId();
  if (!userId) return 10;

  await runThrottled(`reset_weekly_audio_credits:${userId}`, () =>
    supabase.rpc('reset_weekly_audio_credits' as any, { p_user_id: userId }));

  const { data, error } = await supabase
    .from('user_audio_credits' as any).select('credits').eq('user_id', userId).maybeSingle();

  if (!error && data) return Number((data as any).credits);

  await supabase.from('user_audio_credits' as any).insert({ user_id: userId, credits: 10 } as any);
  return 10;
}, 10, { ttlMs: 60_000 });

export const useAudioCredits = () => {
  const { value: audioCredits, loading } = audioCreditsStore.useStore();
  const { isUnlimited } = useVipStatus();
  return {
    audioCredits,
    loading,
    refetch: audioCreditsStore.refetch,
    isUnlimited,
    updateAudioCredits: audioCreditsStore.set,
  };
};
