import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to get auth
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for all DB operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find the invite code
    const { data: inviteCode, error: codeError } = await adminClient
      .from("vip_invite_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .is("used_by", null)
      .maybeSingle();

    if (codeError || !inviteCode) {
      return new Response(JSON.stringify({ error: "Invalid or already used code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check tier exists
    const { data: tierData } = await adminClient
      .from("vip_tiers")
      .select("name, display_name")
      .eq("name", inviteCode.tier_name)
      .maybeSingle();

    if (!tierData) {
      return new Response(JSON.stringify({ error: "Tier no longer exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark code as used
    const { error: updateError } = await adminClient
      .from("vip_invite_codes")
      .update({ used_by: user.id, used_at: new Date().toISOString(), active: false })
      .eq("id", inviteCode.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to redeem code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing VIP status
    await adminClient.from("vip_status").delete().eq("user_id", user.id);

    // Grant VIP status (1 year)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { error: vipError } = await adminClient.from("vip_status").insert({
      user_id: user.id,
      tier: inviteCode.tier_name,
      expires_at: expiresAt.toISOString(),
    });

    if (vipError) {
      return new Response(JSON.stringify({ error: "Failed to grant VIP status" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tier: tierData.display_name,
        tier_name: tierData.name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
