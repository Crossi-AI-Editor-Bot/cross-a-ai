import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAGNIFIC_IMAGE_PREFIX = 'magnific-image/';
const MAGNIFIC_VIDEO_PREFIX = 'magnific-video/';
const MAGNIFIC_MUSIC_PREFIX = 'magnific-music/';

const requestSchema = z.object({
  modelCostId: z.string().uuid(),
  prompt: z.string().min(1).max(4000),
  image: z.string().optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Convert a remote asset URL to data URL so the client can render it without auth. */
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('MAGNIFIC_KEY');
    if (!apiKey) return json(500, { error: 'MAGNIFIC_KEY not configured' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Unauthorized' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json(401, { error: 'Unauthorized' });

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: 'Invalid request' });
    const { modelCostId, prompt, image } = parsed.data;

    // Fetch the model
    const { data: modelData, error: modelErr } = await supabase
      .from('model_costs')
      .select('model_id, image_cost, enabled, public_access, is_fake, fake_error_message')
      .eq('id', modelCostId)
      .single();
    if (modelErr || !modelData) return json(404, { error: 'Model not found' });
    if (!modelData.enabled) return json(403, { error: 'Model is disabled' });
    if ((modelData as any).is_fake) {
      return json(503, { error: (modelData as any).fake_error_message || 'This model is currently unavailable.' });
    }

    const modelId: string = modelData.model_id;
    let kind: 'image' | 'video' | 'music' | null = null;
    let endpointSlug = '';
    if (modelId.startsWith(MAGNIFIC_IMAGE_PREFIX)) {
      kind = 'image';
      endpointSlug = `text-to-image/${modelId.slice(MAGNIFIC_IMAGE_PREFIX.length)}`;
    } else if (modelId.startsWith(MAGNIFIC_VIDEO_PREFIX)) {
      kind = 'video';
      // Video slugs already include sub-route like "image-to-video/kling-..."
      endpointSlug = modelId.slice(MAGNIFIC_VIDEO_PREFIX.length);
    } else if (modelId.startsWith(MAGNIFIC_MUSIC_PREFIX)) {
      kind = 'music';
      endpointSlug = `audio/${modelId.slice(MAGNIFIC_MUSIC_PREFIX.length)}`;
    } else {
      return json(400, { error: 'Not a Magnific model' });
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
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (vipData) {
          const { data: accessData } = await supabase
            .from('model_tier_access').select('has_access')
            .eq('model_cost_id', modelCostId)
            .eq('tier_name', vipData.tier).maybeSingle();
          if (accessData) hasAccess = accessData.has_access;
        }
      }
      if (!hasAccess) return json(403, { error: 'This model requires a higher VIP tier' });
    }

    // Determine if user has unlimited VIP tier (bypasses credit limits)
    let isUnlimited = false;
    {
      const { data: vipRow } = await supabase
        .from('vip_status').select('tier, expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (vipRow) {
        const { data: tierRow } = await supabase
          .from('vip_tiers').select('unlimited')
          .eq('name', vipRow.tier).maybeSingle();
        if (tierRow && (tierRow as any).unlimited === true) isUnlimited = true;
      }
    }

    // Credit check + deduction (single Media Credits pool: user_image_credits)
    const cost = Number(modelData.image_cost) || 0;
    const { data: imgCredits, error: imgErr } = await supabase
      .from('user_image_credits').select('credits')
      .eq('user_id', user.id).single();
    if (imgErr || !imgCredits) return json(500, { error: 'Unable to verify media credits' });
    if (!isUnlimited && imgCredits.credits < cost) return json(402, { error: 'Insufficient media credits' });

    const newCredits = isUnlimited ? Number(imgCredits.credits) : Number(imgCredits.credits) - cost;
    if (!isUnlimited) {
      const { error: updErr } = await supabase
        .from('user_image_credits').update({ credits: newCredits }).eq('user_id', user.id);
      if (updErr) return json(500, { error: 'Failed to deduct credits' });
    }

    // Build payload
    let body: Record<string, unknown> = { prompt };
    if (kind === 'image') body = { prompt, num_images: 1 };
    if (kind === 'music') body = { prompt, music_length_seconds: 30 };
    if (kind === 'video') {
      const isImageToVideo = endpointSlug.startsWith('image-to-video/');
      if (isImageToVideo) {
        if (!image) {
          await supabase.from('user_image_credits').update({ credits: Number(imgCredits.credits) }).eq('user_id', user.id);
          return json(400, { error: 'This video model requires an uploaded source image. Please attach an image and try again.' });
        }
        body = { prompt, image };
      } else {
        body = { prompt };
      }
    }

    const url = `https://api.magnific.com/v1/ai/${endpointSlug}`;
    const createRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      // Refund
      await supabase.from('user_image_credits').update({ credits: Number(imgCredits.credits) }).eq('user_id', user.id);
      console.error('Magnific create failed:', createRes.status, createJson);
      return json(502, { error: createJson?.message || createJson?.error || 'Magnific request failed' });
    }

    const taskId = createJson?.data?.task_id;
    if (!taskId) return json(502, { error: 'No task_id returned by Magnific' });

    // Poll until COMPLETED (or failure)
    const pollUrl = `${url}/${taskId}`;
    let generated: string | null = null;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const pr = await fetch(pollUrl, { headers: { 'x-magnific-api-key': apiKey } });
      const pj = await pr.json().catch(() => ({}));
      const status = pj?.data?.status;
      if (status === 'COMPLETED') {
        const arr = pj?.data?.generated || pj?.data?.output || [];
        if (Array.isArray(arr) && arr.length > 0) generated = arr[0];
        break;
      }
      if (status === 'FAILED' || status === 'ERROR') {
        await supabase.from('user_image_credits').update({ credits: Number(imgCredits.credits) }).eq('user_id', user.id);
        console.error('Magnific poll failed payload:', JSON.stringify(pj));
        const reason = pj?.data?.error || pj?.data?.message || pj?.error || pj?.message || 'Magnific generation failed';
        return json(502, { error: typeof reason === 'string' ? reason : JSON.stringify(reason) });
      }
    }
    if (!generated) return json(504, { error: 'Magnific generation timed out' });

    const dataUrl = await toDataUrl(generated);
    const payload: Record<string, unknown> = { credits: newCredits };
    if (kind === 'image') payload.image = dataUrl;
    if (kind === 'video') payload.video = dataUrl;
    if (kind === 'music') payload.audio = dataUrl;

    return json(200, payload);
  } catch (e) {
    console.error('magnific-generate error:', e);
    return json(500, { error: e instanceof Error ? e.message : 'Internal error' });
  }
});