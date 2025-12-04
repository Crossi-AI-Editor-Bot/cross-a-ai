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

    // Fetch model cost from database
    const { data: modelCostData, error: costError } = await supabase
      .from('model_costs')
      .select('cost')
      .eq('model_id', model)
      .single();

    if (costError) {
      console.error('Error fetching model cost:', costError);
      return new Response(
        JSON.stringify({ error: 'Unable to fetch model cost' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creditCost = modelCostData.cost;
    const initialCredits = userCredits.credits;

    // Validate sufficient credits
    if (initialCredits < creditCost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    
    const isGoogleModel = model.startsWith('google/');
    
    if (isGoogleModel && !GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }
    
    if (!isGoogleModel && !LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('Processing chat request - User:', user.id, 'Messages:', messages.length, 'Model:', model);

    // Check if this is an image generation request
    const isImageGen = model === 'google/gemini-2.5-flash-image';

    let response: Response;

    if (isGoogleModel) {
      // Use Google's Generative Language API directly
      const geminiModel = model.replace('google/', '');
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${isImageGen ? 'generateContent' : 'streamGenerateContent'}?key=${GOOGLE_AI_API_KEY}`;
      
      // Convert messages to Google's format
      const contents = messages.map(msg => {
        const parts: any[] = [];
        
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        
        if (msg.files && msg.files.length > 0) {
          msg.files.forEach((file: any) => {
            if (file.type.startsWith('image/')) {
              // Extract base64 data from data URL
              const base64Data = file.data.split(',')[1];
              parts.push({
                inline_data: {
                  mime_type: file.type,
                  data: base64Data
                }
              });
            }
          });
        }
        
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      // Add system instruction
      const systemInstruction = {
        parts: [{ text: "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Be conversational and engaging." }]
      };

      const googleRequestBody: any = {
        contents,
        systemInstruction,
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 8192,
        }
      };

      if (isImageGen) {
        googleRequestBody.generationConfig.responseModalities = ["TEXT", "IMAGE"];
      }

      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(googleRequestBody),
      });
    } else {
      // Use Lovable AI gateway for OpenAI models
      const requestBody: any = {
        model,
        messages: messages.map(msg => {
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
        }),
        stream: true
      };

      requestBody.messages = [
        { 
          role: "system", 
          content: "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Be conversational and engaging." 
        },
        ...requestBody.messages,
      ];

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
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
      
      return new Response(JSON.stringify({ error: "AI API error", details: errorText }), {
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

    // Handle Google image generation response
    if (isImageGen && isGoogleModel) {
      const jsonResponse = await response.json();
      const candidates = jsonResponse.candidates?.[0]?.content?.parts || [];
      let imageData = null;
      let textContent = "Image generated successfully.";
      
      for (const part of candidates) {
        if (part.inlineData) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        if (part.text) {
          textContent = part.text;
        }
      }
      
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

    console.log('Streaming response from AI');

    // Handle Google streaming response
    if (isGoogleModel) {
      const reader = response.body?.getReader();
      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          let buffer = '';
          
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
              
              buffer += decoder.decode(value, { stream: true });
              
              // Parse Google's streaming format (JSON objects separated by newlines)
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const parsed = JSON.parse(line);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      // Convert to OpenAI-compatible SSE format
                      const sseData = {
                        choices: [{
                          delta: { content: text }
                        }]
                      };
                      const sseEvent = `data: ${JSON.stringify(sseData)}\n\n`;
                      controller.enqueue(new TextEncoder().encode(sseEvent));
                    }
                  } catch (e) {
                    // Skip malformed JSON
                  }
                }
              }
            }
          } catch (error) {
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Handle OpenAI streaming response (via Lovable gateway)
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
