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
    const { config_id } = await req.json();

    if (!config_id) {
      return new Response(JSON.stringify({ error: "config_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get config
    const { data: config, error: configError } = await serviceClient
      .from("custom_vip_configs")
      .select("*")
      .eq("id", config_id)
      .eq("user_id", userId)
      .eq("status", "priced")
      .single();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: "Config not found or not priced" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!config.ai_price || config.ai_price <= 0) {
      return new Response(JSON.stringify({ error: "No price set" }), {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "debit",
        user_id: profile.crossatrix_id,
        amount: config.ai_price,
        description: `Custom VIP: ${config.display_name} monthly subscription`,
      }),
    });

    const croinsData = await croinsRes.json();
    if (!croinsRes.ok || croinsData.error) {
      return new Response(JSON.stringify({ error: croinsData.error || "Insufficient Croins" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set VIP status using the model_access_tier for model permissions
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Delete existing VIP status
    await serviceClient.from("vip_status").delete().eq("user_id", userId);

    // Insert new VIP status with the model_access_tier
    const { error: insertError } = await serviceClient
      .from("vip_status")
      .insert({
        user_id: userId,
        tier: config.model_access_tier,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("VIP insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to activate VIP" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update custom config status
    await serviceClient
      .from("custom_vip_configs")
      .update({
        status: "active",
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", config_id);

    return new Response(JSON.stringify({
      success: true,
      tier: config.model_access_tier,
      expires_at: expiresAt.toISOString(),
      charged: config.ai_price,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Purchase custom VIP error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
