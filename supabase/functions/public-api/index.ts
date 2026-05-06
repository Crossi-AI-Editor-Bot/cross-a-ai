import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let params: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) params[k.toLowerCase()] = v;

    // Support comma-style query: ?Key=X,model=Y,promt=Z
    if (!params.key && url.search) {
      const raw = url.search.replace(/^\?/, '');
      raw.split(/[,&]/).forEach((pair) => {
        const [k, ...rest] = pair.split('=');
        if (k) params[k.toLowerCase()] = decodeURIComponent(rest.join('='));
      });
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        for (const k of Object.keys(body)) params[k.toLowerCase()] = String(body[k]);
      } catch { /* ignore */ }
    }

    const apiKey = params.key || params.api_key;
    const modelInput = params.model;
    const prompt = params.prompt || params.promt;

    if (!apiKey) return json(401, { error: 'Missing key parameter' });
    if (!modelInput) return json(400, { error: 'Missing model parameter' });
    if (!prompt) return json(400, { error: 'Missing prompt parameter' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate API key
    const { data: keyRow } = await admin
      .from('api_keys')
      .select('id, enabled')
      .eq('key', apiKey)
      .maybeSingle();

    if (!keyRow || !keyRow.enabled) return json(401, { error: 'Invalid API key' });

    // Resolve model: accept label (with _ for spaces) or model_id
    const labelLookup = modelInput.replace(/_/g, ' ');
    const { data: models } = await admin
      .from('model_costs')
      .select('id, model_id, label, enabled, system_prompt');

    const match = models?.find(
      (m) =>
        m.label.toLowerCase() === labelLookup.toLowerCase() ||
        m.model_id.toLowerCase() === modelInput.toLowerCase() ||
        m.label.toLowerCase().replace(/\s+/g, '_') === modelInput.toLowerCase()
    );

    if (!match) return json(404, { error: 'Model not found' });
    if (!match.enabled) return json(403, { error: 'Model is disabled' });

    const modelId = match.model_id;

    // Route: text models via Lovable AI Gateway, others not yet supported via this API
    const isMagnific =
      modelId.startsWith('magnific-image/') ||
      modelId.startsWith('magnific-video/') ||
      modelId.startsWith('magnific-music/');
    const isOpenRouter = modelId.startsWith('openrouter/');
    const isImageGen =
      modelId === 'google/gemini-2.5-flash-image' ||
      modelId === 'google/gemini-3-pro-image-preview' ||
      modelId === 'google/gemini-3.1-flash-image-preview';

    // Build messages
    const sysPrompts: { role: 'system'; content: string }[] = [];
    if (match.system_prompt) sysPrompts.push({ role: 'system', content: match.system_prompt });

    if (isMagnific) {
      // Forward to magnific-generate as service-role internal call
      const slug = modelId.split('/').slice(1).join('/');
      const kind = modelId.startsWith('magnific-image/')
        ? 'image'
        : modelId.startsWith('magnific-video/')
        ? 'video'
        : 'music';
      const MAGNIFIC_KEY = Deno.env.get('MAGNIFIC_KEY');
      if (!MAGNIFIC_KEY) return json(500, { error: 'MAGNIFIC_KEY not configured' });

      const endpoint = `https://api.magnific.com/v1/ai/${kind === 'image' ? `text-to-image` : kind === 'music' ? slug : slug}`;
      // Magnific image endpoint actually uses /text-to-image with style slug; but we use its endpoint pattern
      // For simplicity, mirror existing magnific-generate route to /v1/ai/<slug-or-text-to-image>.
      const body: any = { prompt };
      if (kind === 'music') body.music_length_seconds = 30;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-magnific-api-key': MAGNIFIC_KEY,
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) return json(resp.status, { error: data?.message || 'Magnific error', details: data });
      return json(200, { task: data });
    }

    // Text / chat path
    const apiUrl = isOpenRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://ai.gateway.lovable.dev/v1/chat/completions';
    const apiAuth = isOpenRouter
      ? Deno.env.get('OPEN_ROUTER_KEY')
      : Deno.env.get('LOVABLE_API_KEY');
    if (!apiAuth) return json(500, { error: 'AI gateway key not configured' });

    const finalModel = isOpenRouter ? modelId.slice('openrouter/'.length) : modelId;

    if (isImageGen) {
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiAuth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: finalModel,
          messages: [...sysPrompts, { role: 'user', content: prompt }],
          modalities: ['image', 'text'],
        }),
      });
      const d = await r.json();
      if (!r.ok) return json(r.status, { error: 'AI error', details: d });
      return json(200, {
        image: d.choices?.[0]?.message?.images?.[0]?.image_url?.url,
        text: d.choices?.[0]?.message?.content || '',
      });
    }

    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: finalModel,
        messages: [...sysPrompts, { role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    if (!r.ok) return json(r.status, { error: 'AI error', details: d });
    const text = d.choices?.[0]?.message?.content ?? '';
    return json(200, { model: match.label, response: text });
  } catch (e) {
    console.error('public-api error', e);
    return json(500, { error: e instanceof Error ? e.message : 'Internal error' });
  }
});
