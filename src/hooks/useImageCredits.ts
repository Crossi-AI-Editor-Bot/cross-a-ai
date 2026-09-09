import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUserId, runThrottled } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

const imageCreditsStore = createSharedStore<number>(async () => {
  const userId = await getUserId();
  if (!userId) return 30;

  await runThrottled(`reset_weekly_image_credits:${userId}`, () =>
    supabase.rpc('reset_weekly_image_credits', { p_user_id: userId }));

  const { data, error } = await supabase
    .from('user_image_credits')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) return Number(data.credits);

  const { data: newData } = await supabase
    .from('user_image_credits')
    .insert({ user_id: userId, credits: 30 })
    .select('credits')
    .single();
  return newData ? Number(newData.credits) : 30;
}, 30, { ttlMs: 60_000 });

export const useImageCredits = () => {
  const { value: imageCredits, loading } = imageCreditsStore.useStore();
  const { toast } = useToast();

  const deductImageCredits = async (amount: number): Promise<boolean> => {
    const userId = await getUserId();
    if (!userId) {
      toast({
        title: "Login required",
        description: "Please log in to use image generation.",
        variant: "destructive",
      });
      return false;
    }

    if (imageCredits < amount) {
      toast({
        title: "Insufficient media credits",
        description: `You need ${amount} media credits but only have ${imageCredits.toFixed(1)}. Credits reset weekly.`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  return {
    imageCredits,
    deductImageCredits,
    loading,
    updateImageCredits: imageCreditsStore.set,
    refetch: imageCreditsStore.refetch,
  };
};
