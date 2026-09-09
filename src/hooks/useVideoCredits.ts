import { supabase } from "@/integrations/supabase/client";
import { useVipStatus } from "@/hooks/useVipStatus";
import { getUserId, runThrottled } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

const videoCreditsStore = createSharedStore<number>(async () => {
  const userId = await getUserId();
  if (!userId) return 5;

  await runThrottled(`reset_monthly_video_credits:${userId}`, () =>
    supabase.rpc('reset_monthly_video_credits' as any, { p_user_id: userId }));

  const { data, error } = await supabase
    .from('user_video_credits' as any).select('credits').eq('user_id', userId).maybeSingle();

  if (!error && data) return Number((data as any).credits);

  await supabase.from('user_video_credits' as any).insert({ user_id: userId, credits: 5 } as any);
  return 5;
}, 5, { ttlMs: 60_000 });

export const useVideoCredits = () => {
  const { value: videoCredits, loading } = videoCreditsStore.useStore();
  const { isUnlimited } = useVipStatus();
  return {
    videoCredits,
    loading,
    refetch: videoCreditsStore.refetch,
    isUnlimited,
    updateVideoCredits: videoCreditsStore.set,
  };
};
