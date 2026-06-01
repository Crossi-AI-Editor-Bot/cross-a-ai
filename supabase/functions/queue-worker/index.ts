import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callMagicHour(opts: {
  kind: 'image' | 'video' | 'audio';
  endpoint: string;
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<{ ok: true; url: string } | { ok: false; status: number; body: any }> {
  const base = 'https://api.magichour.ai/v1';
  const createRes = await fetch(`${base}/${opts.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(opts.body),
  });
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok) return { ok: false, status: createRes.status, body: createBody };
  const id = createBody?.id;
  if (!id) return { ok: false, status: 502, body: { error: 'No id returned' } };
  const project = opts.kind === 'image' ? 'image-projects' : opts.kind === 'video' ? 'video-projects' : 'audio-projects';
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const pr = await fetch(`${base}/${project}/${id}`, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
    const pj = await pr.json().catch(() => ({}));
    const status = pj?.status;
    if (status === 'complete') {
      const downloads = pj?.downloads || [];
      const url = Array.isArray(downloads) && downloads[0]?.url;
      if (url) return { ok: true, url };
      return { ok: false, status: 502, body: pj };
    }
    if (status === 'error' || status === 'canceled') return { ok: false, status: 502, body: pj };
  }
  return { ok: false, status: 504, body: { error: 'Timeout' } };
}

function buildBody(kind: string, endpoint: string, prompt: string, image?: string, duration?: number) {
  if (kind === 'image') {
    return { image_count: 1, style: { prompt, tool: 'ai-image-generator' }, aspect_ratio: '1:1', orientation: 'square' };
  }
  if (kind === 'audio') return { style: { prompt, voice_name: 'Elizabeth' } };
  if (kind === 'video') {
    if (endpoint === 'image-to-video') {
      return { end_seconds: duration ?? 5, style: { prompt, quality_mode: 'standard' }, assets: { image_file_path: image } };
    }
    return { end_seconds: duration ?? 5, orientation: 'landscape', style: { prompt, quality_mode: 'standard' } };
  }
  return { prompt };
}

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