import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, modelCostId, history } = await req.json();

    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get model configuration if modelCostId is provided
    let modelConfig: { cost: number; system_prompt: string | null } = {
      cost: 1,
      system_prompt: 'You are a helpful voice assistant. Keep your responses concise and conversational since they will be spoken aloud. Avoid using markdown, lists, or special formatting. Respond naturally as if having a phone conversation.',
    };

    if (modelCostId) {
      const { data: modelData, error: modelError } = await supabase
        .from('model_costs')
        .select('cost, system_prompt')
        .eq('id', modelCostId)
        .single();

      if (!modelError && modelData) {
        modelConfig = {
          cost: modelData.cost,
          system_prompt: modelData.system_prompt || modelConfig.system_prompt,
        };
      }
    }

    // Check user credits (regular credits)
    const { data: creditData, error: creditError } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (creditError || !creditData || creditData.credits < modelConfig.cost) {
      return new Response(JSON.stringify({ error: 'Insufficient credits' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentCredits = creditData.credits;

    // Call Lovable AI with GPT-5 Nano
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build messages array with conversation history
    const aiMessages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: modelConfig.system_prompt!,
      },
    ];

    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history) {
        if (msg.role && msg.content) {
          aiMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    aiMessages.push({ role: 'user', content: message });

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-nano',
        messages: aiMessages,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Deduct regular credits
    const newCredits = currentCredits - modelConfig.cost;
    await supabase
      .from('user_credits')
      .update({ credits: newCredits })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ 
      response: responseText,
      credits: newCredits,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Voice chat error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
