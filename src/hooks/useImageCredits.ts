import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useImageCredits = () => {
  const [imageCredits, setImageCredits] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchImageCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Try to reset weekly credits first
      try {
        await supabase.rpc('reset_weekly_image_credits', { p_user_id: user.id });
      } catch {
        // Ignore errors from reset
      }

      const { data, error } = await supabase
        .from('user_image_credits')
        .select('credits, last_reset_date')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no record exists, create one
        if (error.code === 'PGRST116') {
          const { data: newData, error: insertError } = await supabase
            .from('user_image_credits')
            .insert({ user_id: user.id, credits: 30 })
            .select('credits')
            .single();

          if (!insertError && newData) {
            setImageCredits(newData.credits);
          }
        }
      } else if (data) {
        setImageCredits(data.credits);
      }
    } catch (error) {
      console.error('Error fetching image credits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImageCredits();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchImageCredits();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const deductImageCredits = async (amount: number): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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

  const updateImageCredits = (newCredits: number) => {
    setImageCredits(newCredits);
  };

  return { imageCredits, deductImageCredits, loading, updateImageCredits, refetch: fetchImageCredits };
};
