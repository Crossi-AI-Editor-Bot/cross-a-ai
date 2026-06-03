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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find VIP statuses expiring within the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: expiringVips, error } = await serviceClient
      .from("vip_status")
      .select("id, user_id, tier, expires_at")
      .lte("expires_at", tomorrow.toISOString())
      .gte("expires_at", now.toISOString());

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: "Query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const vip of expiringVips || []) {
      // Get tier price
      const { data: tier } = await serviceClient
        .from("vip_tiers")
        .select("croin_price, display_name")
        .eq("name", vip.tier)
        .single();

      if (!tier || !tier.croin_price || tier.croin_price <= 0) {
        // Can't renew - delete VIP
        await serviceClient.from("vip_status").delete().eq("id", vip.id);
        results.push({ user_id: vip.user_id, status: "cancelled", reason: "no_price" });
        continue;
      }

      // Get crossatrix_id
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("crossatrix_id")
        .eq("user_id", vip.user_id)
        .maybeSingle();

      if (!profile?.crossatrix_id) {
        await serviceClient.from("vip_status").delete().eq("id", vip.id);
        results.push({ user_id: vip.user_id, status: "cancelled", reason: "no_crossatrix" });
        continue;
      }

      // Try to debit
      const croinsRes = await fetch(CROINS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "debit",
          user_id: profile.crossatrix_id,
          amount: tier.croin_price,
          description: `VIP ${tier.display_name} monthly renewal`,
        }),
      });

      const croinsData = await croinsRes.json();

      if (!croinsRes.ok || croinsData.error) {
        // Insufficient funds - cancel VIP
        await serviceClient.from("vip_status").delete().eq("id", vip.id);
        results.push({ user_id: vip.user_id, status: "cancelled", reason: "insufficient_croins" });
        continue;
      }

      // Extend by 30 days from current expiry
      const newExpiry = new Date(vip.expires_at);
      newExpiry.setDate(newExpiry.getDate() + 30);

      await serviceClient
        .from("vip_status")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", vip.id);

      results.push({ user_id: vip.user_id, status: "renewed", new_expires_at: newExpiry.toISOString() });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Monthly billing error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
