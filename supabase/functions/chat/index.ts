import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import Replicate from "https://esm.sh/replicate@0.25.2";

// Image generation models
const IMAGE_MODEL_FAST = "google/gemini-2.5-flash-image";
const IMAGE_MODEL_PRO = "google/gemini-3-pro-image-preview";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(10000),
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
    'google/gemini-3-pro-image-preview',
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'google/veo-3.1-fast'
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

    // Check if this is an image generation request
    const isImageGen = model === 'google/gemini-2.5-flash-image' || model === 'google/gemini-3-pro-image-preview';

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

    // For image models, check image credits
    let userImageCredits = null;
    if (isImageGen) {
      const { data: imgCredits, error: imgCreditsError } = await supabase
        .from('user_image_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (imgCreditsError || !imgCredits) {
        return new Response(
          JSON.stringify({ error: 'Unable to verify image credits' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userImageCredits = imgCredits;
    }

    if (!isImageGen && userCredits.credits < 0.1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch model cost and access settings from database
    // Use limit(1) because model_id is no longer unique (e.g., multiple GPT Nano entries)
    const { data: modelCostDataArray, error: costError } = await supabase
      .from('model_costs')
      .select('cost, enabled, public_access, bronze_access, silver_access, gold_access, diamond_access, image_cost, system_prompt')
      .eq('model_id', model)
      .eq('enabled', true)
      .limit(1);

    if (costError) {
      console.error('Error fetching model cost:', costError);
      return new Response(
        JSON.stringify({ error: 'Unable to fetch model cost' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modelCostData = modelCostDataArray?.[0];
    
    if (!modelCostData) {
      return new Response(
        JSON.stringify({ error: 'Model not found or disabled' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check access based on user tier
    // First check if user is admin (admins have full access)
    const { data: adminData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!adminData;

    if (!isAdmin) {
      // Check if model has public access (free users)
      let hasAccess = modelCostData.public_access;

      if (!hasAccess) {
        // Check VIP tier access
        const { data: vipData } = await supabase
          .from('vip_status')
          .select('tier, expires_at')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (vipData) {
          const tier = vipData.tier;
          switch (tier) {
            case 'bronze':
              hasAccess = modelCostData.bronze_access;
              break;
            case 'silver':
              hasAccess = modelCostData.silver_access;
              break;
            case 'gold':
              hasAccess = modelCostData.gold_access;
              break;
            case 'diamond':
              hasAccess = modelCostData.diamond_access;
              break;
          }
        }
      }

      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'This model requires a higher VIP tier' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const creditCost = modelCostData.cost;
    const imageCreditCost = modelCostData.image_cost || 0;
    const initialCredits = userCredits.credits;
    const initialImageCredits = userImageCredits?.credits || 0;

    // Validate sufficient credits based on model type
    if (isImageGen) {
      if (initialImageCredits < imageCreditCost) {
        return new Response(
          JSON.stringify({ error: 'Insufficient image credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (initialCredits < creditCost) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    
    // Check if this is a video generation request - uses Replicate API
    const isVideoGen = model === 'google/veo-3.1-fast';
    
    if (!isVideoGen && !LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
    if (isVideoGen && !REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY is not configured");
    }

    console.log('Processing chat request - User:', user.id, 'Messages:', messages.length, 'Model:', model);

    // Deduct credits before API call
    let newCredits = initialCredits;
    let newImageCredits = initialImageCredits;
    
    if (isImageGen) {
      // Deduct from image credits
      newImageCredits = initialImageCredits - imageCreditCost;
      const { error: deductError } = await supabase
        .from('user_image_credits')
        .update({ credits: newImageCredits })
        .eq('user_id', user.id);

      if (deductError) {
        console.error('Failed to deduct image credits:', deductError);
      }
    } else {
      // Deduct from regular credits
      newCredits = initialCredits - creditCost;
      const { error: deductError } = await supabase
        .from('user_credits')
        .update({ credits: newCredits })
        .eq('user_id', user.id);

      if (deductError) {
        console.error('Failed to deduct credits:', deductError);
      }
    }

    // Handle image generation via Lovable API
    if (isImageGen) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const prompt = lastUserMessage?.content || 'Generate an image';
      
      // Build content array for multimodal request
      const content: any[] = [{ type: "text", text: prompt }];
      
      // Include any images from the last message for editing
      if (lastUserMessage?.files && lastUserMessage.files.length > 0) {
        for (const file of lastUserMessage.files) {
          if (file.type.startsWith('image/')) {
            content.push({
              type: "image_url",
              image_url: { url: file.data }
            });
          }
        }
      }
      
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model === 'google/gemini-3-pro-image-preview' ? IMAGE_MODEL_PRO : IMAGE_MODEL_FAST,
            messages: [{ role: "user", content }],
            modalities: ["image", "text"]
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Lovable Image API error:", response.status, errorText);
          
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
          
          return new Response(JSON.stringify({ error: "Image generation failed", details: errorText }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await response.json();
        const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        const textContent = data.choices?.[0]?.message?.content || "Image generated successfully.";
        
        return new Response(
          JSON.stringify({ 
            image: imageUrl,
            text: textContent,
            credits: newImageCredits 
          }),
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      } catch (error) {
        console.error('Lovable Image API error:', error);
        return new Response(
          JSON.stringify({ error: 'Image generation error', details: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle video generation via Replicate API (VEO 3.1 Fast)
    if (isVideoGen) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const prompt = lastUserMessage?.content || 'Generate a video';
      
      // Extract image URL if provided in files
      let imageUrl: string | undefined;
      let lastFrameUrl: string | undefined;
      
      if (lastUserMessage?.files && lastUserMessage.files.length > 0) {
        for (const file of lastUserMessage.files) {
          if (file.type.startsWith('image/')) {
            // Use the base64 data URL directly or first image as the input
            if (!imageUrl) {
              imageUrl = file.data;
            } else if (!lastFrameUrl) {
              lastFrameUrl = file.data;
            }
          }
        }
      }
      
      try {
        const replicate = new Replicate({
          auth: REPLICATE_API_KEY,
        });

        console.log('Starting VEO 3.1 Fast video generation with prompt:', prompt);
        
        const input: any = {
          prompt: prompt,
          resolution: "720p"
        };
        
        // Add image if provided
        if (imageUrl) {
          input.image = imageUrl;
        }
        if (lastFrameUrl) {
          input.last_frame = lastFrameUrl;
        }

        const output = await replicate.run("google/veo-3.1-fast", { input });
        
        console.log('VEO 3.1 Fast generation response:', output);
        
        // Get the video URL from the output
        let videoUrl: string;
        if (typeof output === 'object' && output !== null && 'url' in output && typeof (output as any).url === 'function') {
          videoUrl = (output as any).url();
        } else if (typeof output === 'string') {
          videoUrl = output;
        } else if (Array.isArray(output) && output.length > 0) {
          videoUrl = output[0];
        } else {
          videoUrl = String(output);
        }
        
        return new Response(
          JSON.stringify({ 
            video: videoUrl,
            text: "Video generated successfully! Here's your video:",
            credits: newCredits 
          }),
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      } catch (error) {
        console.error('Replicate API error:', error);
        return new Response(
          JSON.stringify({ error: 'Video generation error', details: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use Lovable AI gateway for all text models (Google and OpenAI)
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

    // Use custom system prompt if set (for Nano models), otherwise use default
    const systemPrompt = modelCostData.system_prompt || 
      "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Be conversational and engaging.";
    
    requestBody.messages = [
      { 
        role: "system", 
        content: systemPrompt
      },
      ...requestBody.messages,
    ];

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

    // Handle streaming response via Lovable gateway
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
