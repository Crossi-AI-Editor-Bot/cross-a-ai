import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUserId, runThrottled } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

const creditsStore = createSharedStore<number>(async () => {
  const userId = await getUserId();
  if (!userId) return 0;

  // Daily reset only needs to be attempted a couple of times a day per browser.
  await runThrottled(`reset_daily_credits:${userId}`, () =>
    (supabase.rpc as any)('reset_daily_credits', { p_user_id: userId }), 6 * 60 * 60 * 1000);

  const result: any = await supabase
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle();

  return !result.error && result.data ? Number(result.data.credits) : 15;
}, 15, { ttlMs: 60_000 });

export const useCredits = () => {
  const { value: credits, loading } = creditsStore.useStore();
  const { toast } = useToast();

  const deductCredits = async (amount: number): Promise<boolean> => {
    try {
      const userId = await getUserId();
      if (!userId) {
        toast({
          title: "Please log in",
          description: "You need to be logged in to use the chat.",
          variant: "destructive",
        });
        return false;
      }

      if (credits < amount) {
        toast({
          title: "Insufficient credits",
          description: "You don't have enough credits for this request.",
          variant: "destructive",
        });
        return false;
      }

      const newCredits = credits - amount;
      await (supabase.from('user_credits') as any)
        .update({ credits: newCredits })
        .eq('user_id', userId);

      creditsStore.set(newCredits);
      return true;
    } catch (error) {
      console.error('Error deducting credits:', error);
      toast({
        title: "Error",
        description: "Failed to deduct credits. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  return { credits, deductCredits, loading, updateCredits: creditsStore.set };
};
