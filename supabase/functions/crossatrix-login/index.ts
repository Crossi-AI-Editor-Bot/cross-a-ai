import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CROSSATRIX_AUTH_URL = "https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/crossatrix-auth";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Validate credentials with Crossatrix
    const crossatrixRes = await fetch(CROSSATRIX_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!crossatrixRes.ok) {
      const errData = await crossatrixRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: errData.error || "Invalid Crossatrix credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const crossatrixData = await crossatrixRes.json();
    const crossatrixUserId = crossatrixData.user?.id;

    // Step 2: Sign into local Supabase with same credentials
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try signing in first
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    let signInResult = await anonClient.auth.signInWithPassword({ email, password });

    if (signInResult.error) {
      // User doesn't exist locally — create them
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: "Failed to create local account: " + createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Store Crossatrix user ID in profile if available
      if (crossatrixUserId && newUser.user) {
        await supabase
          .from("profiles")
          .update({ crossatrix_id: crossatrixUserId })
          .eq("user_id", newUser.user.id);
      }

      // Now sign in
      signInResult = await anonClient.auth.signInWithPassword({ email, password });

      if (signInResult.error) {
        return new Response(JSON.stringify({ error: "Account created but login failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Update crossatrix_id if not set
      if (crossatrixUserId && signInResult.data.user) {
        await supabase
          .from("profiles")
          .update({ crossatrix_id: crossatrixUserId })
          .eq("user_id", signInResult.data.user.id);
      }
    }

    return new Response(
      JSON.stringify({
        session: signInResult.data.session,
        user: signInResult.data.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Crossatrix login error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
