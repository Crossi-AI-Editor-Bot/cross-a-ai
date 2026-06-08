import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CROINS_API_URL = "https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/croins";

const PRICING: Record<string, { croinsPer10: number; table: string }> = {
  text: { croinsPer10: 2, table: "user_credits" },
  audio: { croinsPer10: 5, table: "user_audio_credits" },
  image: { croinsPer10: 15, table: "user_image_credits" },
  video: { croinsPer10: 200, table: "user_video_credits" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { kind, amount } = await req.json();
    const pricing = PRICING[kind];
    if (!pricing) {
      return new Response(JSON.stringify({ error: "Invalid credit kind" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 10 || amt % 10 !== 0) {
      return new Response(JSON.stringify({ error: "Amount must be a multiple of 10 (min 10)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const croinCost = (amt / 10) * pricing.croinsPer10;

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await serviceClient
      .from("profiles").select("crossatrix_id").eq("user_id", userId).maybeSingle();
    if (!profile?.crossatrix_id) {
      return new Response(JSON.stringify({ error: "No Crossatrix account linked" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Debit Croins
    const croinsRes = await fetch(CROINS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": Deno.env.get("CROINKEY") ?? "" },
      body: JSON.stringify({
        action: "debit",
        user_id: profile.crossatrix_id,
        amount: croinCost,
        description: `Purchased ${amt} ${kind} credits`,
      }),
    });
    const croinsData = await croinsRes.json();
    if (!croinsRes.ok || croinsData.error) {
      return new Response(JSON.stringify({ error: croinsData.error || "Insufficient Croins" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Add credits
    const { data: existing } = await serviceClient
      .from(pricing.table).select("credits").eq("user_id", userId).maybeSingle();

    if (existing) {
      const newCredits = Number((existing as any).credits) + amt;
      const { error: updErr } = await serviceClient
        .from(pricing.table).update({ credits: newCredits }).eq("user_id", userId);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await serviceClient
        .from(pricing.table).insert({ user_id: userId, credits: amt } as any);
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({ success: true, added: amt, charged: croinCost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Purchase credits error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});