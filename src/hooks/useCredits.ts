import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useCredits = () => {
  const [credits, setCredits] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchCredits();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchCredits();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setCredits(0);
        setLoading(false);
        return;
      }

      // Reset credits if it's a new day
      try {
        await (supabase.rpc as any)('reset_daily_credits', { p_user_id: user.id });
      } catch (e) {
        // Ignore RPC errors
      }

      // Fetch current credits
      const result: any = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!result.error && result.data) {
        setCredits(result.data.credits);
      } else {
        setCredits(20);
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const deductCredits = async (amount: number): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
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
        .eq('user_id', user.id);

      setCredits(newCredits);
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

  const updateCredits = (newCredits: number) => {
    setCredits(newCredits);
  };

  return { credits, deductCredits, loading, updateCredits };
};
