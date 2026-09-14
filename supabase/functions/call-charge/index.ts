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

// Charges the model's cost for one completed spoken exchange of a live call.
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
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { modelCostId } = await req.json().catch(() => ({ modelCostId: null }));

    let cost = 1;
    if (modelCostId) {
      const { data: model } = await supabase
        .from("model_costs")
        .select("cost, folder")
        .eq("id", modelCostId)
        .maybeSingle();
      if (model && (model.folder || "").toLowerCase().startsWith("call models")) {
        cost = Number(model.cost || 1);
      }
    }

    // Unlimited tiers are not charged for text/voice conversation
    const { data: vip } = await supabase
      .from("vip_status")
      .select("tier")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (vip?.tier) {
      const { data: tier } = await supabase
        .from("vip_tiers")
        .select("unlimited")
        .eq("name", vip.tier)
        .maybeSingle();
      if (tier?.unlimited) {
        const { data: current } = await supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", user.id)
          .maybeSingle();
        return json({ credits: current?.credits ?? 0, charged: 0 });
      }
    }

    const { data: creditRow } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!creditRow || creditRow.credits < cost) {
      return json({ error: "Insufficient credits" }, 402);
    }

    const newCredits = Number(creditRow.credits) - cost;
    await supabase.from("user_credits").update({ credits: newCredits }).eq("user_id", user.id);

    return json({ credits: newCredits, charged: cost });
  } catch (error) {
    console.error("call-charge error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
