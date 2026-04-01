import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Get the custom config
    const { data: config, error: configError } = await serviceClient
      .from("custom_vip_configs")
      .select("*")
      .eq("id", config_id)
      .eq("user_id", userId)
      .single();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: "Config not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all existing VIP tiers for pricing context
    const { data: tiers } = await serviceClient
      .from("vip_tiers")
      .select("name, display_name, daily_credits, weekly_image_credits, croin_price, sort_order")
      .order("sort_order", { ascending: true });

    const tierInfo = (tiers || []).map(t => 
      `${t.display_name}: ${t.daily_credits} daily credits, ${t.weekly_image_credits} weekly image credits, ¢${t.croin_price}/month`
    ).join("\n");

    // Call GPT Nano via Lovable AI gateway to price this custom VIP
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a pricing AI for a VIP subscription service. You must set a fair monthly price in Croins (¢) for a custom VIP tier.

Here are the existing VIP tiers and their prices:
${tierInfo}

The user wants a custom VIP with:
- Daily credits: ${config.daily_credits}
- Weekly image credits: ${config.weekly_image_credits}
- Model access equivalent to: ${config.model_access_tier} tier

Rules:
1. The price should be proportional to the value provided compared to existing tiers.
2. Custom VIPs should generally cost MORE than the equivalent standard tier (10-30% premium for customization).
3. If credits are between two tiers, interpolate the price.
4. If credits exceed the highest tier, extrapolate proportionally with the premium.
5. Minimum price is ¢5.
6. The price must be a whole number.

Respond with ONLY a JSON object like: {"price": 50, "reasoning": "Brief explanation of pricing logic"}`;

    const aiRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5-nano",
        messages: [
          { role: "system", content: "You are a pricing calculator. Respond only with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI pricing failed:", await aiRes.text());
      return new Response(JSON.stringify({ error: "AI pricing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    
    let price = 50;
    let reasoning = "Default pricing applied";
    
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = aiContent.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        price = Math.max(5, Math.round(parsed.price || 50));
        reasoning = parsed.reasoning || "AI-determined pricing";
      }
    } catch {
      console.error("Failed to parse AI response:", aiContent);
    }

    // Update the config with the AI price
    const { error: updateError } = await serviceClient
      .from("custom_vip_configs")
      .update({
        ai_price: price,
        ai_reasoning: reasoning,
        status: "priced",
        updated_at: new Date().toISOString(),
      })
      .eq("id", config_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save price" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      price,
      reasoning,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Price custom VIP error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
