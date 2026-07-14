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
  modelCostId: z.string().uuid(), // The unique record ID from model_costs table
  discountPercent: z.number().min(0).max(90).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP address
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     req.headers.get('x-real-ip') ||
                     req.headers.get('cf-connecting-ip') ||
                     'unknown';

    // Create service-role client for IP checks (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if IP is blocked
    if (clientIp !== 'unknown') {
      const { data: blockedIp } = await serviceClient
        .from('blocked_ips')
        .select('id')
        .eq('ip_address', clientIp)
        .maybeSingle();

      if (blockedIp) {
        return new Response(
          JSON.stringify({ error: 'blocked', message: 'Your access has been permanently revoked due to policy violations.' }),
          { status: 451, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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

    const { messages, modelCostId, discountPercent } = validatedData;
    const discountMult = 1 - Math.min(Math.max(discountPercent ?? 0, 0), 90) / 100;

    // Fetch model configuration from database using the unique record ID
    const { data: modelCostData, error: costError } = await supabase
      .from('model_costs')
      .select('model_id, label, cost, enabled, public_access, image_cost, system_prompt, is_fake, fake_error_message, fake_corrupted_output, max_tool_calls, tool_switchmodel, tool_croins, tool_vip, tool_credits, tool_email, tool_shares, tool_ccvideo, tool_ccpost, tool_ccsong, tool_ccstream')
      .eq('id', modelCostId)
      .single();

    if (costError || !modelCostData) {
      return new Response(
        JSON.stringify({ error: 'Model not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!modelCostData.enabled) {
      return new Response(
        JSON.stringify({ error: 'Model is disabled' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fake model: return custom error message without deducting credits or calling any API
    if ((modelCostData as any).is_fake) {
      // Corrupted-output mode: stream scrambled letters as if it were a real response.
      if ((modelCostData as any).fake_corrupted_output) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{};:<>,.?/~`§±✦✧✪☄✺☢☣⌬⏧';
        const scramble = (n: number) => {
          let s = '';
          for (let i = 0; i < n; i++) {
            s += charset[Math.floor(Math.random() * charset.length)];
            if (Math.random() < 0.12) s += ' ';
            if (Math.random() < 0.04) s += '\n';
          }
          return s;
        };
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const totalChunks = 12 + Math.floor(Math.random() * 10);
            for (let i = 0; i < totalChunks; i++) {
              const piece = scramble(20 + Math.floor(Math.random() * 40));
              const payload = { choices: [{ delta: { content: piece } }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              await new Promise((r) => setTimeout(r, 40));
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }
      const msg = (modelCostData as any).fake_error_message || 'This model is currently unavailable.';
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let model = modelCostData.model_id;
    const toolFlags = {
      switchmodel: !!(modelCostData as any).tool_switchmodel,
      croins: !!(modelCostData as any).tool_croins,
      vip: !!(modelCostData as any).tool_vip,
      credits: !!(modelCostData as any).tool_credits,
      email: !!(modelCostData as any).tool_email,
      shares: !!(modelCostData as any).tool_shares,
      ccvideo: !!(modelCostData as any).tool_ccvideo,
      ccpost: !!(modelCostData as any).tool_ccpost,
      ccsong: !!(modelCostData as any).tool_ccsong,
      ccstream: !!(modelCostData as any).tool_ccstream,
    };
    const maxToolCalls = Math.max(0, Math.min(20, Number((modelCostData as any).max_tool_calls ?? 3)));

    // Check if this is an image generation request
    const isImageGen = model === 'google/gemini-2.5-flash-image' || model === 'google/gemini-3-pro-image-preview' || model === 'google/gemini-3.1-flash-image-preview';

    // OpenRouter routing: any model with prefix "openrouter/" is sent to
    // https://openrouter.ai/api/v1 using OPEN_ROUTER_KEY.
    const isOpenRouter = model.startsWith('openrouter/');
    const openRouterModelId = isOpenRouter ? model.slice('openrouter/'.length) : '';

    // Fetch global prompts from site_settings
    const [globalKnowledgeRes, globalImageRestrictionsRes] = await Promise.all([
      supabase.from('site_settings').select('value').eq('key', 'global_extra_knowledge').maybeSingle(),
      supabase.from('site_settings').select('value').eq('key', 'global_image_restrictions').maybeSingle(),
    ]);
    const globalExtraKnowledge = (globalKnowledgeRes.data?.value as any)?.text || '';
    const globalImageRestrictions = (globalImageRestrictionsRes.data?.value as any)?.text || '';

    // Check if user has an unlimited VIP tier (bypasses all credit limits)
    let isUnlimited = false;
    {
      const { data: vipRow } = await supabase
        .from('vip_status')
        .select('tier, expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (vipRow) {
        const { data: tierRow } = await supabase
          .from('vip_tiers')
          .select('unlimited')
          .eq('name', vipRow.tier)
          .maybeSingle();
        if (tierRow && (tierRow as any).unlimited === true) isUnlimited = true;
      }
    }

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

    if (!isUnlimited && !isImageGen && userCredits.credits < 0.1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check access based on user tier
    const { data: adminData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!adminData;

    if (!isAdmin) {
      let hasAccess = modelCostData.public_access;

      if (!hasAccess) {
        // Check VIP tier access via junction table
        const { data: vipData } = await supabase
          .from('vip_status')
          .select('tier, expires_at')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (vipData) {
          // Query the junction table for this model + tier
          const { data: accessData } = await supabase
            .from('model_tier_access')
            .select('has_access')
            .eq('model_cost_id', modelCostId)
            .eq('tier_name', vipData.tier)
            .maybeSingle();

          if (accessData) {
            hasAccess = accessData.has_access;
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

    const creditCost = Number(modelCostData.cost) * discountMult;
    const imageCreditCost = (Number(modelCostData.image_cost) || 0) * discountMult;
    const initialCredits = userCredits.credits;
    const initialImageCredits = userImageCredits?.credits || 0;

    // Validate sufficient credits based on model type.
    // Note: unlimited VIPs still consume image/audio/video credits — only text is unlimited.
    if (isImageGen) {
      if (initialImageCredits < imageCreditCost) {
        return new Response(
          JSON.stringify({ error: 'Insufficient image credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (!isUnlimited) {
      if (initialCredits < creditCost) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    const OPEN_ROUTER_KEY = Deno.env.get("OPEN_ROUTER_KEY");
    
    // Check if this is a video generation request - uses Replicate API
    const isVideoGen = model === 'google/veo-3.1-fast';
    
    if (!isVideoGen && !isOpenRouter && !LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
    if (isVideoGen && !REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY is not configured");
    }

    if (isOpenRouter && !OPEN_ROUTER_KEY) {
      throw new Error("OPEN_ROUTER_KEY is not configured");
    }

    console.log('Processing chat request - User:', user.id, 'Messages:', messages.length, 'Model:', model);

    // Deduct credits before API call (skip if unlimited tier)
    let newCredits = initialCredits;
    let newImageCredits = initialImageCredits;

    if (isImageGen) {
      newImageCredits = initialImageCredits - imageCreditCost;
      const { error: deductError } = await supabase
        .from('user_image_credits')
        .update({ credits: newImageCredits })
        .eq('user_id', user.id);

      if (deductError) {
        console.error('Failed to deduct image credits:', deductError);
      }
    } else if (!isUnlimited) {
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
      let prompt = lastUserMessage?.content || 'Generate an image';
      
      // Prepend image restrictions if set
      if (globalImageRestrictions) {
        prompt = `IMPORTANT RESTRICTIONS: ${globalImageRestrictions}\n\nUser request: ${prompt}`;
      }
      
      const content: any[] = [{ type: "text", text: prompt }];
      
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
      
      let imageUrl: string | undefined;
      let lastFrameUrl: string | undefined;
      
      if (lastUserMessage?.files && lastUserMessage.files.length > 0) {
        for (const file of lastUserMessage.files) {
          if (file.type.startsWith('image/')) {
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
        
        if (imageUrl) {
          input.image = imageUrl;
        }
        if (lastFrameUrl) {
          input.last_frame = lastFrameUrl;
        }

        const output = await replicate.run("google/veo-3.1-fast", { input });
        
        console.log('VEO 3.1 Fast generation response:', output);
        
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
      model: isOpenRouter ? openRouterModelId : model,
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
    let systemPrompt = modelCostData.system_prompt || 
      "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Be conversational and engaging.";
    
    // Append global extra knowledge if set
    if (globalExtraKnowledge) {
      systemPrompt += `\n\nADDITIONAL KNOWLEDGE:\n${globalExtraKnowledge}`;
    }
    
    // Check if this model uses crossicon data
    const usesCrossiconData = modelCostData.label?.toLowerCase().includes('crossicon') || 
                               modelCostData.label?.toLowerCase().includes('test');
    
    if (usesCrossiconData) {
      const CROSSICON_API_KEY = Deno.env.get("CROSSICON_API_KEY");
      if (CROSSICON_API_KEY) {
        try {
          console.log('Fetching crossicon articles for model:', modelCostData.label);
          const articlesResponse = await fetch(
            "https://sqntchwyanocimynivqr.supabase.co/functions/v1/get-articles",
            {
              headers: {
                "x-api-key": CROSSICON_API_KEY
              }
            }
          );
          
          if (articlesResponse.ok) {
            const articlesData = await articlesResponse.json();
            console.log('Received crossicon articles:', JSON.stringify(articlesData).substring(0, 200));
            
            const articlesContext = `\n\nYou have access to the following articles from crossicon. Use ONLY this data to answer questions. If the question cannot be answered from this data, say you don't have information about that topic.\n\nARTICLES DATA:\n${JSON.stringify(articlesData, null, 2)}`;
            systemPrompt = systemPrompt + articlesContext;
          } else {
            console.error('Failed to fetch crossicon articles:', articlesResponse.status);
          }
        } catch (fetchError) {
          console.error('Error fetching crossicon articles:', fetchError);
        }
      }
    }
    
    requestBody.messages = [
      { 
        role: "system", 
        content: systemPrompt
      },
      ...requestBody.messages,
    ];

    let gatewayUrl = isOpenRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    let gatewayKey = isOpenRouter ? OPEN_ROUTER_KEY : LOVABLE_API_KEY;
    let gatewayIsOpenRouter = isOpenRouter;

    // Inject tool instructions into system prompt
    const optionalToolLines: string[] = [];
    if (toolFlags.switchmodel) optionalToolLines.push(`- /!switchmodel <model_label>            — swap to another Crossi AI model for the follow-up answer (e.g. an image-gen model). Example: /!switchmodel Gemini 2.5 Flash Image`);
    if (toolFlags.croins) optionalToolLines.push(`- /!croins                                — get the user's current Croin balance.`);
    if (toolFlags.vip) optionalToolLines.push(`- /!vip                                   — get the user's active VIP tier (or "none").`);
    if (toolFlags.credits) optionalToolLines.push(`- /!credits                               — get the user's text / image / video / audio credit balances.`);
    if (toolFlags.email) optionalToolLines.push(`- /!email                                 — get the user's account email.`);
    if (toolFlags.shares) optionalToolLines.push(`- /!shares                                — get the user's Crossatrix shares.`);
    if (toolFlags.ccvideo) optionalToolLines.push(`- /!ccvideo                               — fetch video data. No arguments. Example: /!ccvideo`);
    if (toolFlags.ccpost) optionalToolLines.push(`- /!ccpost                                — fetch post data. No arguments. Example: /!ccpost`);
    if (toolFlags.ccsong) optionalToolLines.push(`- /!ccsong                                — fetch song data. No arguments. Example: /!ccsong`);
    if (toolFlags.ccstream) optionalToolLines.push(`- /!ccstream                              — fetch livestream data. No arguments. Example: /!ccstream`);
    const extraTools = optionalToolLines.length ? `\n${optionalToolLines.join("\n")}` : "";
    const toolInstructions = `\n\nAVAILABLE TOOLS (use only when genuinely useful):
You may invoke tools by emitting one of these commands on its OWN LINE with no markdown/code fences. After the tool runs its output is added to the conversation and you may continue.
- /!csearch "<query>" <page|file> <limit>   — search crossisearch. Choose "page" to search web pages/articles, or "file" to search for downloadable files (PDFs, docs, images, etc). Examples: /!csearch "android security" page 10  •  /!csearch "quarterly report" file 5
- /!web <url>                                 — HTTP GET the URL and read the response. Example: /!web https://example.com/api/data.json
- /!news                                      — fetch the latest news feed (returns up to 100 items). No arguments. Example: /!news
- /!present_file <filename>                   — render a downloadable file card for the user. Put the file body between this line and a line containing exactly /!end_file. Example:
  /!present_file report.txt
  Hello world
  line two
  /!end_file${extraTools}
You may call multiple tools in one turn (one per line). Do NOT explain that you are calling a tool — just emit the command.`;
    (requestBody.messages[0] as any).content = (requestBody.messages[0] as any).content + toolInstructions;

    const CROSSISEARCH_KEY = Deno.env.get("CROSSISEARCH_KEY");
    const CROINKEY = Deno.env.get("CROINKEY");
    const CRASSATRIX_KEY = Deno.env.get("CRASSATRIX_KEY");
    const CC_DATA_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZXdrZG9sbW5yam1ncGx6eHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzE3MTQsImV4cCI6MjA3NzE0NzcxNH0.mtZiST9pfc5DLokcdY0OMAXlpSK1ftkHJY020u1DXQc";
    const CC_DATA_API_BASE = "https://kwewkdolmnrjmgplzxrk.supabase.co/rest/v1/rpc/data_api";
    const TOOL_RE = /^\s*\/!(csearch|web|news|switchmodel|croins|vip|credits|email|shares|ccvideo|ccpost|ccsong|ccstream)\b.*$/gim;
    const TOOL_TIMEOUT_MS = 15000;

    const withTimeout = async (fn: (signal: AbortSignal) => Promise<Response>) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TOOL_TIMEOUT_MS);
      try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
    };

    // Returns structured tool result. `errorKind` is set on failure/empty.
    type ToolResult = { status: number | null; body: string; errorKind?: "timeout" | "network" | "http" | "empty" | "config" | "unknown"; errorMessage?: string };

    const isEmptyPayload = (body: string): boolean => {
      const s = body.trim();
      if (!s) return true;
      try {
        const j = JSON.parse(s);
        if (Array.isArray(j) && j.length === 0) return true;
        if (j && typeof j === "object") {
          const arr = (j as any).results ?? (j as any).items ?? (j as any).data ?? (j as any).hits;
          if (Array.isArray(arr) && arr.length === 0) return true;
          if ((j as any).total === 0 || (j as any).count === 0) return true;
        }
      } catch { /* not JSON — treat non-empty text as non-empty */ }
      return false;
    };

    const runTool = async (raw: string): Promise<ToolResult> => {
      const line = raw.trim();
      const cs = line.match(/^\/!csearch\s+"([^"]+)"\s+(\S+)\s+(\d+)/i) ||
                 line.match(/^\/!csearch\s+(\S+)\s+(\S+)\s+(\d+)/i);
      if (cs) {
        if (!CROSSISEARCH_KEY) return { status: null, body: "CROSSISEARCH_KEY not configured.", errorKind: "config", errorMessage: "Search backend is not configured." };
        const [, query, kindRaw, limit] = cs;
        const kind = /^file/i.test(kindRaw) ? "file" : "page";
        try {
          const r = await withTimeout((signal) => fetch("https://crossisearch.lovable.app/api/public/search", {
            method: "POST",
            headers: { "x-api-key": CROSSISEARCH_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ query, kind, limit: Number(limit) }),
            signal,
          }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `Search returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: `No ${kind} results for "${query}".` };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `Search timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      const wm = line.match(/^\/!web\s+(\S+)/i);
      if (wm) {
        try {
          const r = await withTimeout((signal) => fetch(wm[1], { redirect: "follow", signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `Request returned HTTP ${r.status}.` };
          if (!t.trim()) return { status: r.status, body: t, errorKind: "empty", errorMessage: "Response body was empty." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `Request timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      if (/^\/!news\b/i.test(line)) {
        try {
          const r = await withTimeout((signal) => fetch("https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/news-api/?limit=100", { redirect: "follow", signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `News feed returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: "News feed returned no items." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `News request timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      // ---- Info / account tools (admin-toggled per model) ----------------
      if (/^\/!switchmodel\b/i.test(line) && toolFlags.switchmodel) {
        const sm = line.match(/^\/!switchmodel\s+(.+)$/i);
        if (!sm) return { status: null, body: "Missing model label.", errorKind: "unknown", errorMessage: "Usage: /!switchmodel <model_label>" };
        const target = sm[1].trim();
        const { data: match } = await supabase
          .from('model_costs')
          .select('model_id, label, enabled')
          .or(`label.ilike.${target},model_id.ilike.${target}`)
          .eq('enabled', true)
          .maybeSingle();
        if (!match) return { status: 404, body: `No enabled model matches "${target}".`, errorKind: "empty", errorMessage: `No enabled model matches "${target}".` };
        const newModelId = (match as any).model_id as string;
        model = newModelId;
        gatewayIsOpenRouter = newModelId.startsWith('openrouter/');
        gatewayUrl = gatewayIsOpenRouter
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://ai.gateway.lovable.dev/v1/chat/completions";
        gatewayKey = gatewayIsOpenRouter ? OPEN_ROUTER_KEY : LOVABLE_API_KEY;
        requestBody.model = gatewayIsOpenRouter ? newModelId.slice('openrouter/'.length) : newModelId;
        return { status: 200, body: `Switched to "${(match as any).label}" (${newModelId}). Continue the response using the new model.` };
      }
      if (/^\/!email\b/i.test(line) && toolFlags.email) {
        return { status: 200, body: JSON.stringify({ email: user.email ?? null }) };
      }
      if (/^\/!vip\b/i.test(line) && toolFlags.vip) {
        const { data: vip } = await supabase
          .from('vip_status')
          .select('tier, expires_at')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        return { status: 200, body: JSON.stringify(vip ?? { tier: "none" }) };
      }
      if (/^\/!credits\b/i.test(line) && toolFlags.credits) {
        const [tx, im, vd, au] = await Promise.all([
          supabase.from('user_credits').select('credits').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_image_credits').select('credits').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_video_credits').select('credits').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_audio_credits').select('credits').eq('user_id', user.id).maybeSingle(),
        ]);
        return { status: 200, body: JSON.stringify({
          text: tx.data?.credits ?? 0,
          image: im.data?.credits ?? 0,
          video: vd.data?.credits ?? 0,
          audio: au.data?.credits ?? 0,
        }) };
      }
      if (/^\/!croins\b/i.test(line) && toolFlags.croins) {
        const { data: profile } = await serviceClient
          .from('profiles').select('crossatrix_id').eq('user_id', user.id).maybeSingle();
        if (!profile?.crossatrix_id) return { status: 400, body: "No Crossatrix account linked.", errorKind: "empty", errorMessage: "No Crossatrix account linked." };
        if (!CROINKEY) return { status: null, body: "CROINKEY missing", errorKind: "config", errorMessage: "Croins backend not configured." };
        try {
          const r = await withTimeout((signal) => fetch("https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/croins", {
            method: "POST", signal,
            headers: { "Content-Type": "application/json", "x-api-key": CROINKEY },
            body: JSON.stringify({ action: "balance", user_id: profile.crossatrix_id }),
          }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `Croins returned HTTP ${r.status}.` };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? "Croins request timed out." : `Network error: ${msg}` };
        }
      }
      if (/^\/!shares\b/i.test(line) && toolFlags.shares) {
        const { data: profile } = await serviceClient
          .from('profiles').select('crossatrix_id').eq('user_id', user.id).maybeSingle();
        if (!profile?.crossatrix_id) return { status: 400, body: "No Crossatrix account linked.", errorKind: "empty", errorMessage: "No Crossatrix account linked." };
        try {
          const url = `https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/user-shares-api?user=${encodeURIComponent(profile.crossatrix_id)}`;
          const r = await withTimeout((signal) => fetch(url, {
            signal,
            headers: CRASSATRIX_KEY ? { "x-api-key": CRASSATRIX_KEY } : {},
          }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `Shares API returned HTTP ${r.status}.` };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? "Shares request timed out." : `Network error: ${msg}` };
        }
      }
      // ---- CC data tools (admin-toggled per model) -------------------------
      if (/^\/!ccvideo\b/i.test(line) && toolFlags.ccvideo) {
        try {
          const r = await withTimeout((signal) => fetch(`${CC_DATA_API_BASE}?action=video&apikey=${CC_DATA_API_KEY}`, { signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `ccvideo returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: "ccvideo returned no items." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `ccvideo timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      if (/^\/!ccpost\b/i.test(line) && toolFlags.ccpost) {
        try {
          const r = await withTimeout((signal) => fetch(`${CC_DATA_API_BASE}?action=post&apikey=${CC_DATA_API_KEY}`, { signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `ccpost returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: "ccpost returned no items." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `ccpost timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      if (/^\/!ccsong\b/i.test(line) && toolFlags.ccsong) {
        try {
          const r = await withTimeout((signal) => fetch(`${CC_DATA_API_BASE}?action=song&apikey=${CC_DATA_API_KEY}`, { signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `ccsong returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: "ccsong returned no items." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `ccsong timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      if (/^\/!ccstream\b/i.test(line) && toolFlags.ccstream) {
        try {
          const r = await withTimeout((signal) => fetch(`${CC_DATA_API_BASE}?action=livestream&apikey=${CC_DATA_API_KEY}`, { signal }));
          const t = await r.text();
          if (!r.ok) return { status: r.status, body: t, errorKind: "http", errorMessage: `ccstream returned HTTP ${r.status}.` };
          if (isEmptyPayload(t)) return { status: r.status, body: t, errorKind: "empty", errorMessage: "ccstream returned no items." };
          return { status: r.status, body: t };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const timeout = /abort/i.test(msg);
          return { status: null, body: msg, errorKind: timeout ? "timeout" : "network", errorMessage: timeout ? `ccstream timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}` };
        }
      }
      // Tool exists but is disabled for this model
      if (/^\/!(switchmodel|croins|vip|credits|email|shares|ccvideo|ccpost|ccsong|ccstream)\b/i.test(line)) {
        return { status: 403, body: "Tool disabled for this model.", errorKind: "config", errorMessage: "This tool is disabled for the current model." };
      }
      return { status: null, body: "Unknown tool invocation.", errorKind: "unknown", errorMessage: "Unknown tool invocation." };
    };

    const doModelCall = async (msgs: any[], stream: boolean) => {
      return await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
          ...(gatewayIsOpenRouter ? { "HTTP-Referer": "https://cross-a-ai.lovable.app", "X-Title": "Crossi AI" } : {}),
        },
        body: JSON.stringify({ ...requestBody, messages: msgs, stream }),
      });
    };

    const errorResp = async (response: Response) => {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI service error", details: errorText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // Multi-turn tool loop with LIVE SSE streaming so the client can render
    // loading placeholders for each tool while it runs.
    const encoder = new TextEncoder();
    const FILE_RE = /^\s*\/!present_file\s+(\S+)\s*\n([\s\S]*?)\n\s*\/!end_file\s*$/gim;

    const sseStream = new ReadableStream({
      async start(controller) {
        const sendText = (text: string) => {
          const payload = { choices: [{ delta: { content: text } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const sendChunked = (text: string, chunk = 60) => {
          for (let i = 0; i < text.length; i += chunk) sendText(text.slice(i, i + chunk));
        };

        try {
          let convo = [...requestBody.messages];
          let toolCallCount = 0;
          const MAX_ITERS = Math.max(1, maxToolCalls + 1);
          let finalContent = "";

          for (let iter = 0; iter < MAX_ITERS; iter++) {
            const r = await doModelCall(convo, false);
            if (!r.ok) {
              const errorText = await r.text();
              sendText(`\n\n[Error contacting model: HTTP ${r.status}]`);
              console.error("AI API error:", r.status, errorText);
              break;
            }
            const j = await r.json();
            const content: string = j.choices?.[0]?.message?.content ?? "";
            const matches = content.match(TOOL_RE) || [];
            if (matches.length === 0 || iter === MAX_ITERS - 1 || toolCallCount >= maxToolCalls) {
              finalContent = content;
              break;
            }
            const results: string[] = [];
            for (const m of matches) {
              if (toolCallCount >= maxToolCalls) break;
              toolCallCount++;
              const id = `t${Date.now()}_${toolCallCount}`;
              const trimmed = m.trim();
              const nameMatch = trimmed.match(/^\/!(\w+)/);
              const toolName = nameMatch ? nameMatch[1].toLowerCase() : "tool";
              sendText(`[[TOOL_START]]${JSON.stringify({ id, tool: toolName, args: trimmed })}[[/TOOL_START]]\n`);
              const startedAt = Date.now();
              const res = await runTool(m);
              const durationMs = Date.now() - startedAt;
              const resultStr = res.status != null ? `[HTTP ${res.status}] ${res.body}` : res.body;
              sendText(`[[TOOL_END]]${JSON.stringify({ id, tool: toolName, args: trimmed, result: resultStr, durationMs, errorKind: res.errorKind ?? null, errorMessage: res.errorMessage ?? null })}[[/TOOL_END]]\n`);
              const forModel = res.errorKind
                ? `\`${trimmed}\` → ERROR (${res.errorKind}): ${res.errorMessage}${res.body ? `\n${res.body}` : ""}`
                : `\`${trimmed}\` →\n${resultStr}`;
              results.push(forModel);
            }
            convo.push({ role: "assistant", content });
            convo.push({ role: "user", content: `[TOOL RESULTS]\n\n${results.join("\n\n---\n\n")}\n\nUse these results to answer the user's original question. Do not repeat the tool commands unless another lookup is required.` });
            finalContent = content;
          }

          // Extract /!present_file ... /!end_file blocks into file cards.
          const files: Array<{ name: string; content: string }> = [];
          let visibleBody = finalContent.replace(FILE_RE, (_m, name, body) => {
            files.push({ name: String(name), content: String(body) });
            return "";
          });

          // Strip any remaining tool command lines from the final visible content.
          visibleBody = visibleBody.replace(TOOL_RE, "").replace(/\n{3,}/g, "\n\n").trim();

          const header = toolCallCount > 0 ? `_${toolCallCount} Tool${toolCallCount > 1 ? "s" : ""} used_\n\n` : "";
          sendChunked(header + visibleBody);
          for (const f of files) {
            sendText(`\n\n[[FILE]]${JSON.stringify(f)}[[/FILE]]`);
          }
        } catch (e) {
          console.error("Streaming loop error:", e);
          sendText(`\n\n[Error: ${e instanceof Error ? e.message : String(e)}]`);
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(sseStream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
