import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, conversationId } = await req.json();

    if (!messages || messages.length < 2 || !conversationId) {
      return new Response(
        JSON.stringify({ error: 'Need at least 2 messages and conversation ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPEN_ROUTER_KEY = Deno.env.get("OPEN_ROUTER_KEY");

    if (!OPEN_ROUTER_KEY) {
      throw new Error("OPEN_ROUTER_KEY is not configured");
    }

    // Try the free Llama 3.2 3B first; fall back to the paid variant. If the AI
    // is unavailable, derive a title from the first message instead of failing.
    const toText = (c: any) => typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join(" ") : "";
    let title = "";
    for (const model of ["meta-llama/llama-3.2-3b-instruct:free", "meta-llama/llama-3.2-3b-instruct"]) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPEN_ROUTER_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Generate a short, concise title (max 5 words) for this conversation based on the messages. Only respond with the title, nothing else. No quotes or punctuation at the end." },
              { role: "user", content: `User: ${toText(messages[0].content)}\n\nAssistant: ${toText(messages[1].content)}` },
            ],
          }),
        });
        if (!response.ok) { console.error("Title model failed:", model, response.status); continue; }
        const data = await response.json();
        title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") || "";
        if (title) break;
      } catch (err) { console.error("Title model error:", model, err); }
    }
    if (!title) {
      const words = toText(messages[0].content).replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
      title = words.slice(0, 50) || "New Chat";
    }

    // Update conversation title
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to update title:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update conversation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generated title for conversation:', conversationId, '->', title);

    return new Response(
      JSON.stringify({ title }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error("Generate title error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
