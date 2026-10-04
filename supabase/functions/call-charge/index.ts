import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Debits call credits: (blocks of 1000 tokens) * model.call_credits_per_1000_tokens.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const modelCostId = typeof body.modelCostId === "string" ? body.modelCostId : null;
    const blocks = Math.floor(Number(body.blocks ?? 0));
    const checkOnly = blocks === 0;
    if (!Number.isFinite(blocks) || blocks < 0 || blocks > 100) {
      return json({ error: "Invalid blocks" }, 400);
    }

    let rate = 1;
    if (modelCostId) {
      const { data: model } = await supabase
        .from("model_costs")
        .select("call_credits_per_1000_tokens")
        .eq("id", modelCostId)
        .maybeSingle();
      if (model) rate = Number((model as any).call_credits_per_1000_tokens ?? 1);
    }

    const { data: row } = await supabase
      .from("user_call_credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();
    const current = Number(row?.credits ?? 0);

    if (checkOnly) return json({ credits: current, rate, charged: 0 });

    const cost = blocks * rate;
    if (current < cost) return json({ error: "Insufficient call credits", credits: current, rate }, 402);

    const newCredits = Math.round((current - cost) * 100000) / 100000;
    await supabase
      .from("user_call_credits")
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return json({ credits: newCredits, rate, charged: cost });
  } catch (error) {
    console.error("call-charge error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
