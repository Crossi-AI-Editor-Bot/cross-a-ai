import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CROINS_API_URL = "https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/croins";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { tier_name, dynamic_ceiling_tier, dynamic_model_ids } = await req.json();

    if (!tier_name) {
      return new Response(JSON.stringify({ error: "tier_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get tier info
    const { data: tier, error: tierError } = await serviceClient
      .from("vip_tiers")
      .select("name, display_name, croin_price, is_dynamic")
      .eq("name", tier_name)
      .single();

    if (tierError || !tier) {
      return new Response(JSON.stringify({ error: "Tier not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tier.croin_price || tier.croin_price <= 0) {
      return new Response(JSON.stringify({ error: "This tier cannot be purchased" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get crossatrix_id
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("crossatrix_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.crossatrix_id) {
      return new Response(JSON.stringify({ error: "No Crossatrix account linked" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Debit Croins
    const croinsRes = await fetch(CROINS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("CROINKEY") ?? "",
      },
      body: JSON.stringify({
        action: "debit",
        user_id: profile.crossatrix_id,
        amount: tier.croin_price,
        description: `VIP ${tier.display_name} monthly subscription`,
      }),
    });

    const croinsData = await croinsRes.json();
    if (!croinsRes.ok || croinsData.error) {
      return new Response(JSON.stringify({ error: croinsData.error || "Insufficient Croins" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set VIP status for 30 days - upsert
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Delete existing VIP status first, then insert new
    await serviceClient
      .from("vip_status")
      .delete()
      .eq("user_id", userId);

    const { error: insertError } = await serviceClient
      .from("vip_status")
      .insert({
        user_id: userId,
        tier: tier.name,
        expires_at: expiresAt.toISOString(),
        dynamic_ceiling_tier: (tier as any).is_dynamic ? (dynamic_ceiling_tier ?? null) : null,
        dynamic_model_ids: (tier as any).is_dynamic ? (Array.isArray(dynamic_model_ids) ? dynamic_model_ids : []) : [],
      });

    if (insertError) {
      console.error("VIP insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to activate VIP" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      tier: tier.name,
      expires_at: expiresAt.toISOString(),
      charged: tier.croin_price,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Purchase VIP error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
