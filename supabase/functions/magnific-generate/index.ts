import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  modelCostId: z.string().uuid(),
  prompt: z.string().min(1).max(4000),
  chatId: z.string().uuid().optional(),
  forceQueue: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authentifizierung des Users
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: corsHeaders });
    const { modelCostId, prompt, chatId, forceQueue = false } = parsed.data;

    // Modelldaten und Kosten auslesen
    const { data: modelData, error: modelErr } = await supabase
      .from('model_costs')
      .select('model_id, image_cost, video_credits_per_second, audio_credits_per_second')
      .eq('id', modelCostId)
      .single();
    if (modelErr || !modelData) return new Response(JSON.stringify({ error: 'Model not found' }), { status: 404, headers: corsHeaders });

    const modelId: string = modelData.model_id;
    let kind: 'image' | 'video' | 'audio' = 'image';
    let targetTable = 'user_image_credits';

    if (modelId.includes('video')) {
      kind = 'video';
      targetTable = 'user_video_credits';
    } else if (modelId.includes('music') || modelId.includes('audio')) {
      kind = 'audio';
      targetTable = 'user_audio_credits';
    }

    // Falls User direkt der Queue beitreten will
    if (forceQueue) {
      await supabase.from('generation_queue').insert({ user_id: user.id, chat_id: chatId, prompt, generation_type: kind, model_cost_id: modelCostId });
      return new Response(JSON.stringify({ status: 'queued' }), { headers: corsHeaders });
    }

    // Credits abziehen (für Video/Audio basierend auf geschätzter Länge, z.B. 5 Sek Standard)
    let cost = Number(modelData.image_cost) || 0;
    if (kind === 'video') cost = 5 * (Number(modelData.video_credits_per_second) || 1);
    if (kind === 'audio') cost = 5 * (Number(modelData.audio_credits_per_second) || 1);

    const { data: userCreds } = await supabase.from(targetTable).select('credits').eq('user_id', user.id).single();
    if (!userCreds || userCreds.credits < cost) {
      return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: corsHeaders });
    }

    // Key Zuordnung nach Aufgabengebiet
    const keysMap = {
      video: [Deno.env.get('MH1'), Deno.env.get('MH2'), Deno.env.get('MH3')],
      image: [Deno.env.get('MH4'), Deno.env.get('MH5')],
      audio: [Deno.env.get('MH6')]
    };
    const availableKeys = keysMap[kind].filter(Boolean);

    let apiSuccess = false;
    let resultUrl = "";
    let status402Count = 0;

    // Durchlaufe alle Keys (Ausfallsicherheit)
    for (const key of availableKeys) {
      let apiEndpoint = "https://api.magichour.ai/v1/image/generate";
      let apiBody: any = { prompt, model: "free-plan-default" };

      if (kind === 'video') {
        apiEndpoint = "https://api.magichour.ai/v1/video/generate";
      } else if (kind === 'audio') {
        apiEndpoint = "https://api.magichour.ai/v1/audio/text-to-voice";
        apiBody = { text: prompt, model: "free-plan-tts" }; // Nur Text-To-Voice erlaubt!
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody)
      });

      if (response.status === 402) {
        status402Count++;
        continue; // Nächster Key ohne Fehler auszugeben
      }

      if (response.ok) {
        const resData = await response.json();
        resultUrl = resData.url || resData.download_url;
        apiSuccess = true;
        break;
      }
    }

    // Wenn ALLE verfügbaren Keys 402 zurückgeben
    if (!apiSuccess && status402Count === availableKeys.length) {
      return new Response(JSON.stringify({ error: '402_ALL_EXHAUSTED' }), { status: 402, headers: corsHeaders });
    }

    if (!apiSuccess) {
      return new Response(JSON.stringify({ error: 'Generation failed on all endpoints' }), { status: 502, headers: corsHeaders });
    }

    // Credits final abbuchen bei Erfolg
    await supabase.from(targetTable).update({ credits: userCreds.credits - cost }).eq('user_id', user.id);

    // Antwort im Chat speichern, damit man sie beim nächsten Laden sieht
    if (chatId) {
      await supabase.from('messages').insert({
        chat_id: chatId,
        role: 'assistant',
        content: `Hier ist dein Ergebnis: ${resultUrl}`
      });
    }

    const responsePayload: Record<string, string> = {};
    responsePayload[kind] = resultUrl;
    return new Response(JSON.stringify(responsePayload), { headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Internal error' }), { status: 500, headers: corsHeaders });
  }
});
