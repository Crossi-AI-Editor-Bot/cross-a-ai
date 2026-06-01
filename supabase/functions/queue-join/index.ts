import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const schema = z.object({
  modelCostId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  prompt: z.string().min(1).max(4000),
  kind: z.enum(['image', 'video', 'audio']),
  image: z.string().optional(),
  duration: z.number().int().min(1).max(60).optional(),
});

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json(401, { error: 'Unauthorized' });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: 'Invalid request' });
    const p = parsed.data;

    const { data, error } = await supabase
      .from('generation_queue')
      .insert({
        user_id: user.id,
        conversation_id: p.conversationId ?? null,
        model_cost_id: p.modelCostId,
        kind: p.kind,
        prompt: p.prompt,
        image_input: p.image ?? null,
        duration: p.duration ?? null,
      })
      .select()
      .single();
    if (error) return json(500, { error: error.message });

    // Compute position in queue for this kind
    const { count } = await supabase
      .from('generation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('kind', p.kind)
      .in('status', ['queued', 'processing'])
      .lte('position', data.position);

    return json(200, { id: data.id, position: count ?? 1 });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Internal error' });
  }
});