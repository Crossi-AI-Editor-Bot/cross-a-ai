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

      // Resets ausführen
      try {
        await supabase.rpc('reset_weekly_image_credits', { p_user_id: user.id });
        await supabase.rpc('reset_monthly_video_credits', { p_user_id: user.id });
        await supabase.rpc('reset_weekly_audio_credits', { p_user_id: user.id });
      } catch { /* Resets ignorieren falls Fehler */ }

      // 1. Image Credits
      const { data: imgData } = await supabase.from('user_image_credits').select('credits').eq('user_id', user.id).maybeSingle();
      if (imgData) setImageCredits(imgData.credits);

      // 2. Video Credits
      const { data: vidData } = await supabase.from('user_video_credits').select('credits').eq('user_id', user.id).maybeSingle();
      if (vidData) {
        setVideoCredits(vidData.credits);
      } else {
        await supabase.from('user_video_credits').insert({ user_id: user.id, credits: 5 });
      }

      // 3. Audio Credits
      const { data: audData } = await supabase.from('user_audio_credits').select('credits').eq('user_id', user.id).maybeSingle();
      if (audData) {
        setAudioCredits(audData.credits);
      } else {
        await supabase.from('user_audio_credits').insert({ user_id: user.id, credits: 10 });
      }

    } catch (error) {
      console.error('Error fetching media credits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllCredits();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => { fetchAllCredits(); });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const deductMediaCredits = async (kind: 'image' | 'video' | 'audio', amount: number): Promise<boolean> => {
    if (isUnlimited) return true;
    
    let currentCredits = imageCredits;
    if (kind === 'video') currentCredits = videoCredits;
    if (kind === 'audio') currentCredits = audioCredits;

    if (currentCredits < amount) {
      toast({
        title: "Ungenügend Credits",
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
