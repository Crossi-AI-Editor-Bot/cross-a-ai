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

const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";
const ALLOWED_LIVE_MODELS = [
  "gemini-2.5-flash-native-audio-latest",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
  "gemini-3.1-flash-live-preview",
  "gemini-3.5-live-translate-preview",
  "gemini-3.5-transcribe-live",
];

const DEFAULT_PROMPT =
  "You are a friendly voice assistant on a phone call. Keep answers short, natural and conversational. Never use markdown, lists or special formatting. You have no tools and cannot browse, search, run code or generate files — if asked, say so plainly.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // FIX: Use case-insensitive regex to strip the Bearer prefix
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // NOTE: Verify this isn't meant to be GOOGLE_API_KEY in your env vars
    const googleKey = Deno.env.get("GoogleAPIKEY");
    if (!googleKey) return json({ error: "Voice calls are not configured" }, 500);

    const { modelCostId } = await req.json().catch(() => ({ modelCostId: null }));
    if (!modelCostId) return json({ error: "No call model selected" }, 400);

    const { data: model, error: modelError } = await supabase
      .from("model_costs")
      .select("id, model_id, label, cost, enabled, folder, system_prompt, public_access, is_fake, fake_error_message")
      .eq("id", modelCostId)
      .maybeSingle();

    if (modelError || !model) return json({ error: "Call model not found" }, 404);
    if (!model.enabled) return json({ error: "This call model is currently disabled" }, 403);
    if (!(model.folder || "").toLowerCase().startsWith("call models")) {
      return json({ error: "This model cannot be used for calls" }, 403);
    }
    if (model.is_fake) {
      return json({ error: model.fake_error_message || "This model is unavailable." }, 400);
    }

    // Access check: public, or the user's active VIP tier has access to this model.
    let allowed = !!model.public_access;
    if (!allowed) {
      const { data: vip } = await supabase
        .from("vip_status")
        .select("tier, dynamic_model_ids")
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (vip?.dynamic_model_ids?.includes(model.id)) allowed = true;

      if (!allowed && vip?.tier) {
        const { data: access } = await supabase
          .from("model_tier_access")
          .select("has_access")
          .eq("model_cost_id", model.id)
          .eq("tier_name", vip.tier)
          .maybeSingle();
        allowed = !!access?.has_access;
      }
    }
    if (!allowed) return json({ error: "This call model is VIP only" }, 403);

    const rawId = (model.model_id || "").split("/").pop() || DEFAULT_LIVE_MODEL;
    const liveModel = ALLOWED_LIVE_MODELS.includes(rawId) ? rawId : DEFAULT_LIVE_MODEL;

    const now = Date.now();
    const tokenRes = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${googleKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
          // REST name for the SDK's "liveConnectConstraints"
          bidiGenerateContentSetup: {
            model: `models/${liveModel}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: model.system_prompt || DEFAULT_PROMPT }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      },
    );

    if (!tokenRes.ok) {
      const details = await tokenRes.text();
      console.error("Live token error", tokenRes.status, details);
      return json({ error: "Could not start the call", status: tokenRes.status, details }, 502);
    }

    const tokenData = await tokenRes.json();

    return json({
      token: tokenData.name,
      model: `models/${liveModel}`,
      systemPrompt: model.system_prompt || DEFAULT_PROMPT,
      // FIX: Used ?? instead of || so a cost of 0 does not evaluate to 1
      cost: 0,
      label: model.label,
    });
  } catch (error) {
    console.error("gemini-live-token error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
