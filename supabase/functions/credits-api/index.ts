import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Credits API: read balances or DECREASE credits. Increasing is never allowed.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TABLES: Record<string, string> = {
  text: 'user_credits',
  image: 'user_image_credits',
  video: 'user_video_credits',
  audio: 'user_audio_credits',
  call: 'user_call_credits',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const p: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) p[k.toLowerCase()] = v;
    if (req.method === 'POST') {
      try {
        const b = await req.json();
        for (const k of Object.keys(b ?? {})) p[k.toLowerCase()] = String(b[k]);
      } catch { /* no body */ }
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Resolve user: bearer/access_token (the user themself) OR API key + user identifier
    let userId: string | null = null;
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || p.access_token;
    const apiKey = req.headers.get('x-api-key') || p.key || p.api_key;

    if (apiKey) {
      const { data: keyRow } = await admin.from('api_keys').select('enabled').eq('key', apiKey).maybeSingle();
      if (!keyRow?.enabled) return json(401, { error: 'Invalid API key' });
      if (p.user_id) userId = p.user_id;
      else if (p.email) {
        const { data } = await admin.from('profiles').select('user_id').ilike('email', p.email).maybeSingle();
        userId = data?.user_id ?? null;
      } else if (bearer) {
        const { data } = await admin.auth.getUser(bearer);
        userId = data.user?.id ?? null;
      } else return json(400, { error: 'Provide user_id or email with the API key' });
    } else if (bearer) {
      const { data } = await admin.auth.getUser(bearer);
      userId = data.user?.id ?? null;
      if (!userId) return json(401, { error: 'Invalid access token' });
    } else return json(401, { error: 'Missing authentication (access token or API key)' });

    if (!userId) return json(404, { error: 'User not found' });

    const action = (p.action || (req.method === 'POST' ? 'decrease' : 'read')).toLowerCase();

    if (action === 'read') {
      const balances: Record<string, number | null> = {};
      await Promise.all(Object.entries(TABLES).map(async ([type, table]) => {
        const { data } = await admin.from(table).select('credits').eq('user_id', userId).maybeSingle();
        balances[type] = data ? Number(data.credits) : null;
      }));
      return json(200, { user_id: userId, credits: balances });
    }

    if (action !== 'decrease') return json(400, { error: 'action must be "read" or "decrease"' });

    const type = (p.type || 'text').toLowerCase();
    const table = TABLES[type];
    if (!table) return json(400, { error: `type must be one of: ${Object.keys(TABLES).join(', ')}` });

    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      return json(400, { error: 'amount must be a positive number. Only credit deductions are permitted.' });
    }

    // Optimistic compare-and-swap so concurrent calls can't over-spend
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row } = await admin.from(table).select('credits').eq('user_id', userId).maybeSingle();
      if (!row) return json(404, { error: `No ${type} credit balance for this user` });
      const current = Number(row.credits);
      if (current < amount) return json(402, { error: 'Insufficient credits', type, credits: current });
      const next = Math.round((current - amount) * 1e5) / 1e5;
      const { data: upd, error } = await admin.from(table).update({ credits: next })
        .eq('user_id', userId).eq('credits', row.credits).select('credits');
      if (error) return json(500, { error: 'Failed to update credits' });
      if (upd && upd.length > 0) return json(200, { user_id: userId, type, deducted: amount, credits: next });
    }
    return json(409, { error: 'Balance changed concurrently, please retry' });
  } catch (e) {
    console.error('credits-api error:', e instanceof Error ? e.message : e);
    return json(500, { error: 'Internal error' });
  }
});
