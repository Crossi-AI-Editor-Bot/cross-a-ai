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
    const body = await req.json();

    // Token login (used by other websites): verify access_token with Crossatrix, no refresh token sent.
    if (typeof body.access_token === "string" && body.access_token) {
      const tokenEmail = typeof body.email === "string" ? body.email.trim() : "";
      if (!tokenEmail || body.access_token.length > 8192) {
        return new Response(JSON.stringify({ error: "access_token and email are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cRes = await fetch(CROSSATRIX_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: body.access_token, email: tokenEmail }),
      });
      const cData = await cRes.json().catch(() => ({}));
      if (!cRes.ok) {
        return new Response(JSON.stringify({ error: cData.error || "Invalid or expired token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email: string = (cData.user?.email ?? tokenEmail).toLowerCase();
      const cxId = cData.user?.id;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      // Create local account if missing (random password; errors if it already exists, which is fine)
      await admin.auth.admin.createUser({
        email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
      });
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (linkErr || !link?.properties?.hashed_token) {
        return new Response(JSON.stringify({ error: "Could not create session" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: v, error: vErr } = await anon.auth.verifyOtp({
        type: "magiclink", token_hash: link.properties.hashed_token,
      });
      if (vErr || !v.session) {
        return new Response(JSON.stringify({ error: "Could not create session" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cxId && v.user) {
        await admin.from("profiles").update({ crossatrix_id: cxId }).eq("user_id", v.user.id);
      }
      return new Response(JSON.stringify({ session: v.session, user: v.user }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identifier: string | undefined = body.identifier ?? body.email ?? body.username;
    const password: string | undefined = body.password;

    if (!identifier || !password) {
      return new Response(JSON.stringify({ error: "Email or username and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Validate credentials with Crossatrix
    const crossatrixRes = await fetch(CROSSATRIX_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, identifier, username: identifier, password }),
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

    // Crossatrix may authenticate by username; always use the canonical email it returns
    const email: string | undefined =
      crossatrixData.user?.email ?? (identifier.includes("@") ? identifier : undefined);

    if (!email) {
      return new Response(JSON.stringify({ error: "Could not resolve account email from Crossatrix" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Sign into local Supabase with same credentials
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Retry transient backend errors (e.g. 5xx while the backend is waking up).
    const isTransient = (e: any) => {
      const s = Number(e?.status);
      return (Number.isFinite(s) && s >= 500) || /HTTP 5\d\d|fetch failed|timed? ?out/i.test(String(e?.message ?? ""));
    };
    const withRetry = async <T extends { error: any }>(fn: () => Promise<T>): Promise<T> => {
      let r = await fn();
      for (let i = 1; i <= 4 && r.error && isTransient(r.error); i++) {
        await new Promise((res) => setTimeout(res, 1500 * i));
        r = await fn();
      }
      return r;
    };
    const unavailable = () => new Response(JSON.stringify({ error: "Login is temporarily unavailable. Please try again in a minute." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Try signing in first
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    let signInResult = await withRetry(() => anonClient.auth.signInWithPassword({ email, password }));
    if (signInResult.error && isTransient(signInResult.error)) return unavailable();

    if (signInResult.error) {
      // User doesn't exist locally — create them
      const { data: newUser, error: createError } = await withRetry(() => supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }));

      if (createError) {
        if (isTransient(createError)) return unavailable();
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
