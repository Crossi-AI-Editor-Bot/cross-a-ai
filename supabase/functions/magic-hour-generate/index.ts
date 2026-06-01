import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const requestSchema = z.object({
  modelCostId: z.string().uuid(),
  prompt: z.string().min(1).max(4000),
  image: z.string().optional(),
  duration: z.number().int().min(1).max(60).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function toDataUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    const buf = new Uint8Array(await r.arrayBuffer());
    const mime = r.headers.get('content-type') || 'application/octet-stream';
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return url;
  }
}

// Returns { ok: true, url } | { ok: false, status, body }
export async function callMagicHour(opts: {
  kind: 'image' | 'video' | 'audio';
  endpoint: string; // e.g. 'ai-image-generator'
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
  if (!createRes.ok) {
    return { ok: false, status: createRes.status, body: createBody };
  }
  const id = createBody?.id;
  if (!id) return { ok: false, status: 502, body: { error: 'No id returned' } };

  const project = opts.kind === 'image' ? 'image-projects'
    : opts.kind === 'video' ? 'video-projects' : 'audio-projects';

  // Poll up to ~3 minutes
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const pr = await fetch(`${base}/${project}/${id}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    const pj = await pr.json().catch(() => ({}));
    const status = pj?.status;
    if (status === 'complete') {
      const downloads = pj?.downloads || [];
      const url = Array.isArray(downloads) && downloads[0]?.url;
      if (url) return { ok: true, url };
      return { ok: false, status: 502, body: pj };
    }
    if (status === 'error' || status === 'canceled') {
      return { ok: false, status: 502, body: pj };
    }
  }
  return { ok: false, status: 504, body: { error: 'Timeout' } };
}

export function buildBody(kind: string, endpoint: string, prompt: string, image?: string, duration?: number) {
  if (kind === 'image') {
    return {
      image_count: 1,
      style: { prompt, tool: 'ai-image-generator' },
      aspect_ratio: '1:1',
      orientation: 'square',
    };
  }
  if (kind === 'audio') {
    return { style: { prompt, voice_name: 'Elizabeth' } };
  }
  if (kind === 'video') {
    if (endpoint === 'image-to-video') {
      return {
        end_seconds: duration ?? 5,
        style: { prompt, quality_mode: 'standard' },
        assets: { image_file_path: image },
      };
    }
    return {
      end_seconds: duration ?? 5,
      orientation: 'landscape',
      style: { prompt, quality_mode: 'standard' },
    };
  }
  return { prompt };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Unauthorized' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const service = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json(401, { error: 'Unauthorized' });

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: 'Invalid request' });
    const { modelCostId, prompt, image, duration } = parsed.data;

    const { data: modelData, error: modelErr } = await supabase
      .from('model_costs')
      .select('model_id, image_cost, audio_credits_per_second, video_credits_per_second, enabled, public_access, is_fake, fake_error_message, fake_corrupted_output, kind')
      .eq('id', modelCostId)
      .single();
    if (modelErr || !modelData) return json(404, { error: 'Model not found' });
    if (!modelData.enabled) return json(403, { error: 'Model is disabled' });

    const modelId: string = modelData.model_id;
    let kind: 'image' | 'video' | 'audio' | null = null;
    let endpoint = '';
    if (modelId.startsWith('magic-hour-image/')) { kind = 'image'; endpoint = modelId.slice('magic-hour-image/'.length); }
    else if (modelId.startsWith('magic-hour-video/')) { kind = 'video'; endpoint = modelId.slice('magic-hour-video/'.length); }
    else if (modelId.startsWith('magic-hour-audio/')) { kind = 'audio'; endpoint = modelId.slice('magic-hour-audio/'.length); }
    else return json(400, { error: 'Not a Magic Hour model' });

    // Fake-model handling kept
    if ((modelData as any).is_fake) {
      if (!(modelData as any).fake_corrupted_output) {
        return json(503, { error: (modelData as any).fake_error_message || 'This model is currently unavailable.' });
      }
      const randBytes = (n: number) => {
        const b = new Uint8Array(n); crypto.getRandomValues(b);
        let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
        return btoa(bin);
      };
      const payload: Record<string, unknown> = {};
      if (kind === 'image') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#0a0a0a"/><text x="20" y="50" fill="#f0f" font-family="monospace" font-size="20">CORRUPTED</text></svg>`;
        payload.image = `data:image/svg+xml;base64,${btoa(svg)}`;
      } else if (kind === 'audio') payload.audio = `data:audio/wav;base64,${randBytes(8000)}`;
      else payload.video = `data:video/mp4;base64,${randBytes(8000)}`;
      return json(200, payload);
    }

    // Tier access
    const { data: adminData } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    const isAdmin = !!adminData;
    if (!isAdmin) {
      let hasAccess = modelData.public_access;
      if (!hasAccess) {
        const { data: vipData } = await supabase
          .from('vip_status').select('tier, expires_at')
          .eq('user_id', user.id).gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (vipData) {
          const { data: accessData } = await supabase
            .from('model_tier_access').select('has_access')
            .eq('model_cost_id', modelCostId).eq('tier_name', vipData.tier).maybeSingle();
          if (accessData) hasAccess = accessData.has_access;
        }
      }
      if (!hasAccess) return json(403, { error: 'This model requires a higher VIP tier' });
    }

    // Unlimited check
    let isUnlimited = false;
    {
      const { data: vipRow } = await supabase
        .from('vip_status').select('tier, expires_at')
        .eq('user_id', user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (vipRow) {
        const { data: tierRow } = await supabase
          .from('vip_tiers').select('unlimited').eq('name', vipRow.tier).maybeSingle();
        if (tierRow && (tierRow as any).unlimited === true) isUnlimited = true;
      }
    }

    // Compute cost
    const dur = duration ?? 5;
    let creditTable = '';
    let cost = 0;
    if (kind === 'image') {
      creditTable = 'user_image_credits'; cost = Number(modelData.image_cost) || 1;
    } else if (kind === 'audio') {
      creditTable = 'user_audio_credits'; cost = (Number(modelData.audio_credits_per_second) || 1) * dur;
    } else {
      creditTable = 'user_video_credits'; cost = (Number(modelData.video_credits_per_second) || 1) * dur;
    }

    let currentCredits = 0;
    if (!isUnlimited) {
      const { data: cRow } = await service.from(creditTable).select('credits').eq('user_id', user.id).maybeSingle();
      if (!cRow) {
        // Auto-init row for audio/video tables
        await service.from(creditTable).insert({ user_id: user.id, credits: 0 }).select().single();
        currentCredits = 0;
      } else {
        currentCredits = Number(cRow.credits);
      }
      if (currentCredits < cost) {
        const poolLabel = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio';
        return json(402, { error: `Insufficient ${poolLabel} credits` });
      }
    }

    // Fetch enabled keys for category, randomly ordered
    const { data: keys } = await service
      .from('magic_hour_keys')
      .select('id, secret_name')
      .eq('category', kind)
      .eq('enabled', true);

    if (!keys || keys.length === 0) {
      return json(503, { error: 'No API keys configured for this category' });
    }
    // Random order
    const shuffled = [...keys].sort(() => Math.random() - 0.5);

    const body = buildBody(kind, endpoint, prompt, image, dur);
    let lastError: any = null;
    let all402 = true;

    for (const key of shuffled) {
      const secret = Deno.env.get(key.secret_name);
      if (!secret) continue;
      const result = await callMagicHour({ kind, endpoint, apiKey: secret, body });
      if (result.ok) {
        // Deduct credits
        let newCredits = currentCredits;
        if (!isUnlimited) {
          newCredits = currentCredits - cost;
          await service.from(creditTable).update({ credits: newCredits }).eq('user_id', user.id);
        }
        const dataUrl = await toDataUrl(result.url);
        const payload: Record<string, unknown> = { credits: newCredits };
        if (kind === 'image') payload.image = dataUrl;
        else if (kind === 'video') payload.video = dataUrl;
        else payload.audio = dataUrl;
        return json(200, payload);
      }
      if (result.status === 402) {
        await service.from('magic_hour_keys').update({ last_402_at: new Date().toISOString() }).eq('id', key.id);
        lastError = result.body;
        continue;
      }
      // Non-402 error → real failure
      all402 = false;
      lastError = result.body;
      break;
    }

    if (all402) {
      return json(200, { status: 'queue_offer', message: 'All keys are out of free credits. Join the queue?' });
    }
    return json(502, { error: lastError?.error || lastError?.message || 'Generation failed' });
  } catch (e) {
    console.error('magic-hour-generate error', e);
    return json(500, { error: e instanceof Error ? e.message : 'Internal error' });
  }
});