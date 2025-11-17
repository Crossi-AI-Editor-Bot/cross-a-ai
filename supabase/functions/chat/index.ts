import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(10000),
    files: z.array(z.object({
      name: z.string(),
      type: z.string(),
      data: z.string()
    })).optional()
  })).min(1).max(100),
  model: z.enum([
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro', 
    'google/gemini-2.5-flash-lite',
    'google/gemini-2.5-flash-image',
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano'
  ]).default('google/gemini-2.5-flash')
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user authentication
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

    // Validate input
    const body = await req.json();
    let validatedData;
    
    try {
      validatedData = chatRequestSchema.parse(body);
    } catch (e) {
      const error = e as z.ZodError;
      return new Response(
        JSON.stringify({ error: 'Invalid request format', details: error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, model } = validatedData;

    // Check and deduct credits server-side
    const { data: userCredits, error: creditsError } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (creditsError || !userCredits) {
      return new Response(
        JSON.stringify({ error: 'Unable to verify credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userCredits.credits < 0.1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Model cost mapping
    const modelCosts: Record<string, number> = {
      'openai/gpt-5-nano': 0.2,
      'openai/gpt-5-mini': 0.5,
      'google/gemini-2.5-flash-lite': 0.1,
      'google/gemini-2.5-flash': 0.5,
      'google/gemini-2.5-flash-image': 1,
      'openai/gpt-5': 3,
      'google/gemini-2.5-pro': 1.5,
    };

    const creditCost = modelCosts[model] || 0.5;
    const initialCredits = userCredits.credits;

    // Validate sufficient credits
    if (initialCredits < creditCost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('Processing chat request - User:', user.id, 'Messages:', messages.length, 'Model:', model);

    // Check if this is an image generation request
    const isImageGen = model === 'google/gemini-2.5-flash-image';

    const requestBody: any = {
      model,
      messages: messages.map(msg => {
        // Handle files (images) in the message
        if (msg.files && msg.files.length > 0) {
          const content: any[] = [];
          
          if (msg.content) {
            content.push({ type: "text", text: msg.content });
          }
          
          msg.files.forEach((file: any) => {
            if (file.type.startsWith('image/')) {
              content.push({
                type: "image_url",
                image_url: { url: file.data }
              });
            }
          });
          
          return {
            role: msg.role,
            content
          };
        }
        
        return {
          role: msg.role,
          content: msg.content
        };
      })
    };

    // Add system message for non-image generation
    if (!isImageGen) {
      requestBody.messages = [
        { 
          role: "system", 
          content: "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Be conversational and engaging." 
        },
        ...requestBody.messages,
      ];
      requestBody.stream = true;
    } else {
      requestBody.modalities = ["image", "text"];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits after successful API call
    const newCredits = initialCredits - creditCost;
    const { error: deductError } = await supabase
      .from('user_credits')
      .update({ credits: newCredits })
      .eq('user_id', user.id);

    if (deductError) {
      console.error('Failed to deduct credits:', deductError);
    }

    // Handle image generation response
    if (isImageGen) {
      const jsonResponse = await response.json();
      const imageData = jsonResponse.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const textContent = jsonResponse.choices?.[0]?.message?.content || "Image generated successfully.";
      
      return new Response(
        JSON.stringify({ 
          image: imageData,
          text: textContent,
          credits: newCredits 
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log('Streaming response from AI gateway');

    // Create a stream that includes the credits update
    const reader = response.body?.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) {
              // Send credits update before closing
              const creditsEvent = `data: ${JSON.stringify({ type: 'credits', credits: newCredits })}\n\n`;
              controller.enqueue(new TextEncoder().encode(creditsEvent));
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
