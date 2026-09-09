import { supabase } from "@/integrations/supabase/client";
import { getUserId, runThrottled } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

const callCreditsStore = createSharedStore<number>(async () => {
  const userId = await getUserId();
  if (!userId) return 100;

  await runThrottled(`reset_weekly_call_credits:${userId}`, () =>
    (supabase.rpc as any)('reset_weekly_call_credits', { p_user_id: userId }));

  const { data, error } = await (supabase.from('user_call_credits') as any)
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) return Number(data.credits);

  const { data: newData } = await (supabase.from('user_call_credits') as any)
    .insert({ user_id: userId, credits: 100 })
    .select('credits')
    .single();
  return newData ? Number(newData.credits) : 100;
}, 100, { ttlMs: 60_000 });

export const useCallCredits = () => {
  const { value: callCredits, loading } = callCreditsStore.useStore();
  return {
    callCredits,
    loading,
    updateCallCredits: callCreditsStore.set,
    refetch: callCreditsStore.refetch,
  };
};
