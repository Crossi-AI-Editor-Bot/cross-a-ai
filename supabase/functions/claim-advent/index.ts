import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { day } = await req.json();
    if (typeof day !== 'number' || day < 1 || day > 24) {
      return new Response(
        JSON.stringify({ error: 'Invalid day number. Must be between 1 and 24.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Server-side date validation
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();

    if (currentMonth !== 12) {
      return new Response(
        JSON.stringify({ error: 'The advent calendar is only available in December.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (day > currentDay) {
      return new Response(
        JSON.stringify({ error: `You can only open this door on December ${day}.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already claimed
    const { data: existingClaim } = await serviceClient
      .from('advent_claims')
      .select('id')
      .eq('user_id', user.id)
      .eq('day_number', day)
      .eq('year', currentYear)
      .maybeSingle();

    if (existingClaim) {
      return new Response(
        JSON.stringify({ error: "You've already opened this door!" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminRole } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!adminRole;

    // Check if user already has active VIP status
    const { data: existingVip } = await serviceClient
      .from('vip_status')
      .select('expires_at')
      .eq('user_id', user.id)
      .gt('expires_at', now.toISOString())
      .maybeSingle();

    const userIsVip = isAdmin || !!existingVip;

    // SERVER-SIDE RANDOM GENERATION (secure)
    const randomBytes = new Uint8Array(2);
    crypto.getRandomValues(randomBytes);
    
    // Use first byte for VIP chance (0-255, need < 26 for ~10% chance)
    const getsVip = !userIsVip && randomBytes[0] < 26;
    
    // Use second byte for credits (1-15)
    const creditsAwarded = getsVip ? 0 : (randomBytes[1] % 15) + 1;

    // Insert claim using service role
    const { error: claimError } = await serviceClient
      .from('advent_claims')
      .insert({
        user_id: user.id,
        day_number: day,
        credits_awarded: creditsAwarded,
        year: currentYear,
      });

    if (claimError) {
      console.error('Error inserting claim:', claimError);
      return new Response(
        JSON.stringify({ error: 'Failed to save claim.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let vipExpiresAt: string | null = null;

    // If user gets VIP, create VIP status
    if (getsVip) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15);
      vipExpiresAt = expiresAt.toISOString();

      const { error: vipError } = await serviceClient
        .from('vip_status')
        .upsert({
          user_id: user.id,
          expires_at: vipExpiresAt,
        });

      if (vipError) {
        console.error('Error granting VIP:', vipError);
      }
    }

    // Update user credits if credits were awarded
    if (creditsAwarded > 0) {
      const { data: currentCredits } = await serviceClient
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (currentCredits) {
        await serviceClient
          .from('user_credits')
          .update({ credits: currentCredits.credits + creditsAwarded })
          .eq('user_id', user.id);
      }
    }

    console.log(`User ${user.id} claimed day ${day}: ${getsVip ? 'VIP' : creditsAwarded + ' credits'}`);

    return new Response(
      JSON.stringify({
        success: true,
        getsVip,
        creditsAwarded,
        vipExpiresAt,
        day,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in claim-advent:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
