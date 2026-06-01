import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callMagicHour, buildBody } from '../magic-hour-generate/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function toDataUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    const buf = new Uint8Array(await r.arrayBuffer());
    const mime = r.headers.get('content-type') || 'application/octet-stream';
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${mime};base64,${btoa(bin)}`;
  } catch { return url; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const processed: string[] = [];

  for (const kind of ['image', 'video', 'audio'] as const) {
    // Pick the oldest queued item for this kind
    const { data: items } = await service
      .from('generation_queue')
      .select('*')
      .eq('kind', kind)
      .eq('status', 'queued')
      .order('position', { ascending: true })
      .limit(1);
    if (!items || items.length === 0) continue;
    const item = items[0];

    // 3-minute throttle
    if (item.last_attempt_at) {
      const last = new Date(item.last_attempt_at).getTime();
      if (Date.now() - last < 3 * 60 * 1000) continue;
    }

    await service.from('generation_queue').update({
      status: 'processing', last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    // Look up model + endpoint
    const { data: model } = await service
      .from('model_costs')
      .select('model_id, image_cost, audio_credits_per_second, video_credits_per_second')
      .eq('id', item.model_cost_id)
      .single();
    if (!model) {
      await service.from('generation_queue').update({ status: 'failed', error: 'Model not found' }).eq('id', item.id);
      continue;
    }

    let endpoint = '';
    if (kind === 'image') endpoint = model.model_id.slice('magic-hour-image/'.length);
    else if (kind === 'video') endpoint = model.model_id.slice('magic-hour-video/'.length);
    else endpoint = model.model_id.slice('magic-hour-audio/'.length);

    const { data: keys } = await service
      .from('magic_hour_keys')
      .select('id, secret_name')
      .eq('category', kind)
      .eq('enabled', true);
    if (!keys || keys.length === 0) {
      await service.from('generation_queue').update({ status: 'queued' }).eq('id', item.id);
      continue;
    }

    const body = buildBody(kind, endpoint, item.prompt, item.image_input ?? undefined, item.duration ?? undefined);
    let success: { url: string } | null = null;
    let all402 = true;
    let lastErr: any = null;

    for (const key of keys.sort(() => Math.random() - 0.5)) {
      const secret = Deno.env.get(key.secret_name);
      if (!secret) continue;
      const result = await callMagicHour({ kind, endpoint, apiKey: secret, body });
      if (result.ok) { success = { url: result.url }; break; }
      if (result.status === 402) {
        await service.from('magic_hour_keys').update({ last_402_at: new Date().toISOString() }).eq('id', key.id);
        continue;
      }
      all402 = false; lastErr = result.body; break;
    }

    if (success) {
      // Deduct credits
      const dur = item.duration ?? 5;
      let cost = 0;
      let table = '';
      if (kind === 'image') { table = 'user_image_credits'; cost = Number(model.image_cost) || 1; }
      else if (kind === 'audio') { table = 'user_audio_credits'; cost = (Number(model.audio_credits_per_second) || 1) * dur; }
      else { table = 'user_video_credits'; cost = (Number(model.video_credits_per_second) || 1) * dur; }

      const { data: cRow } = await service.from(table).select('credits').eq('user_id', item.user_id).maybeSingle();
      if (cRow && Number(cRow.credits) >= cost) {
        await service.from(table).update({ credits: Number(cRow.credits) - cost }).eq('user_id', item.user_id);
      }

      const dataUrl = await toDataUrl(success.url);
      const update: Record<string, unknown> = { status: 'done' };
      if (kind === 'image') update.result_image = dataUrl;
      else if (kind === 'video') update.result_video = dataUrl;
      else update.result_audio = dataUrl;
      await service.from('generation_queue').update(update).eq('id', item.id);

      // Post assistant message into chat if conversation_id exists
      if (item.conversation_id) {
        const text = kind === 'image' ? "Here's your generated image:" : kind === 'video' ? "Here's your generated video:" : "Here's your generated audio:";
        const content = JSON.stringify({
          text,
          image: kind === 'image' ? dataUrl : undefined,
          video: kind === 'video' ? dataUrl : undefined,
          audio: kind === 'audio' ? dataUrl : undefined,
        });
        await service.from('messages').insert({ conversation_id: item.conversation_id, role: 'assistant', content });
      }
      processed.push(item.id);
    } else if (all402) {
      await service.from('generation_queue').update({ status: 'queued' }).eq('id', item.id);
    } else {
      await service.from('generation_queue').update({
        status: 'failed',
        error: typeof lastErr === 'string' ? lastErr : (lastErr?.error || lastErr?.message || 'Generation failed'),
      }).eq('id', item.id);
    }
  }

  return new Response(JSON.stringify({ processed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});