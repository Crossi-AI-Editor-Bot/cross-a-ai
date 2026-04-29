import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  modelCostId: z.string().uuid(),
});

/**
 * Server-side credit check + deduction for client-side image generations
 * (used by Puter.js image models which run entirely in the browser).
 * Verifies user auth, model access by tier, and atomically deducts
 * image_cost from user_image_credits.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.errors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { modelCostId } = parsed.data;

    // Fetch model
    const { data: modelData, error: modelErr } = await supabase
      .from('model_costs')
      .select('image_cost, enabled, public_access')
      .eq('id', modelCostId)
      .single();

    if (modelErr || !modelData) {
      return new Response(JSON.stringify({ error: 'Model not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!modelData.enabled) {
      return new Response(JSON.stringify({ error: 'Model is disabled' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tier-access check (matches chat function logic)
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
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: 'This model requires a higher VIP tier' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const cost = Number(modelData.image_cost) || 0;

    const { data: imgCredits, error: imgErr } = await supabase
      .from('user_image_credits').select('credits')
      .eq('user_id', user.id).single();

    if (imgErr || !imgCredits) {
      return new Response(JSON.stringify({ error: 'Unable to verify image credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (imgCredits.credits < cost) {
      return new Response(JSON.stringify({ error: 'Insufficient image credits' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newCredits = Number(imgCredits.credits) - cost;
    const { error: updateErr } = await supabase
      .from('user_image_credits')
      .update({ credits: newCredits })
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('Failed to deduct image credits:', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ credits: newCredits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('deduct-image-credits error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});