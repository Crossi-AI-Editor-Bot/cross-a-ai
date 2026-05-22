import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVipStatus } from "@/hooks/useVipStatus";

export const useImageCredits = () => {
  const [imageCredits, setImageCredits] = useState<number>(30);
  const [videoCredits, setVideoCredits] = useState<number>(5);
  const [audioCredits, setAudioCredits] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { isUnlimited } = useVipStatus();

  const fetchAllCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Wöchentliche und monatliche Resets über RPC triggern
      try {
        await supabase.rpc('reset_weekly_image_credits', { p_user_id: user.id });
      } catch { /* Ignoriere RPC Fehler */ }

      try {
        await supabase.rpc('reset_monthly_video_credits', { p_user_id: user.id });
      } catch { /* Ignoriere RPC Fehler */ }

      try {
        await supabase.rpc('reset_weekly_audio_credits', { p_user_id: user.id });
      } catch { /* Ignoriere RPC Fehler */ }


      // === 1. IMAGE CREDITS ===
      const { data: imgData, error: imgError } = await supabase
        .from('user_image_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (imgData) {
        setImageCredits(imgData.credits);
      } else if (!imgError) {
        try {
          const { data: newImgData } = await supabase
            .from('user_image_credits')
            .insert({ user_id: user.id, credits: 30 })
            .select('credits')
            .single();

          if (newImgData) setImageCredits(newImgData.credits);
        } catch {
          const { data: retryImg } = await supabase
            .from('user_image_credits')
            .select('credits')
            .eq('user_id', user.id)
            .maybeSingle();
          if (retryImg) setImageCredits(retryImg.credits);
        }
      }


      // === 2. VIDEO CREDITS ===
      const { data: vidData, error: vidError } = await supabase
        .from('user_video_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (vidData) {
        setVideoCredits(vidData.credits);
      } else if (!vidError) {
        try {
          const { data: newVidData } = await supabase
            .from('user_video_credits')
            .insert({ user_id: user.id, credits: 5 })
            .select('credits')
            .single();

          if (newVidData) setVideoCredits(newVidData.credits);
        } catch {
          const { data: retryVid } = await supabase
            .from('user_video_credits')
            .select('credits')
            .eq('user_id', user.id)
            .maybeSingle();
          if (retryVid) setVideoCredits(retryVid.credits);
        }
      }


      // === 3. AUDIO CREDITS ===
      const { data: audData, error: audError } = await supabase
        .from('user_audio_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (audData) {
        setAudioCredits(audData.credits);
      } else if (!audError) {
        try {
          const { data: newAudData } = await supabase
            .from('user_audio_credits')
            .insert({ user_id: user.id, credits: 10 })
            .select('credits')
            .single();

          if (newAudData) setAudioCredits(newAudData.credits);
        } catch {
          const { data: retryAud } = await supabase
            .from('user_audio_credits')
            .select('credits')
            .eq('user_id', user.id)
            .maybeSingle();
          if (retryAud) setAudioCredits(retryAud.credits);
        }
      }

    } catch (error) {
      console.error('Error fetching media credits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllCredits();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchAllCredits();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const deductMediaCredits = async (kind: 'image' | 'video' | 'audio', amount: number): Promise<boolean> => {
    if (isUnlimited) return true;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Login erforderlich",
        description: "Bitte melde dich an, um die Generierung zu nutzen.",
        variant: "destructive",
      });
      return false;
    }

    let currentCredits = imageCredits;
    if (kind === 'video') currentCredits = videoCredits;
    if (kind === 'audio') currentCredits = audioCredits;

    if (currentCredits < amount) {
      toast({
        title: "Ungenügend Media Credits",
        description: `Du brauchst ${amount} ${kind} Credits, hast aber nur ${currentCredits.toFixed(1)}.`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  return { 
    imageCredits, 
    videoCredits, 
    audioCredits, 
    deductMediaCredits, 
    loading, 
    refetch: fetchAllCredits 
  };
};
