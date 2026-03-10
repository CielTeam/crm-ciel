import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, email, display_name, avatar_url } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if a profile already exists for this Auth0 user_id
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    let profile;
    let profileError;

    if (existingProfile && existingProfile.length > 0) {
      // Profile exists — update it
      const result = await supabaseAdmin
        .from("profiles")
        .update({
          email: email || null,
          display_name: display_name || null,
          avatar_url: avatar_url || null,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .select()
        .single();
      profile = result.data;
      profileError = result.error;
    } else if (email) {
      // No profile for this user_id — check for a pending profile by email
      const { data: pendingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id")
        .eq("email", email.toLowerCase().trim())
        .is("deleted_at", null)
        .limit(1);

      if (pendingProfile && pendingProfile.length > 0 && pendingProfile[0].user_id.startsWith("pending|")) {
        // Link pending profile to real Auth0 user_id
        const result = await supabaseAdmin
          .from("profiles")
          .update({
            user_id,
            display_name: display_name || null,
            avatar_url: avatar_url || null,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingProfile[0].id)
          .select()
          .single();
        profile = result.data;
        profileError = result.error;

        // Also update user_roles to use the real user_id
        await supabaseAdmin
          .from("user_roles")
          .update({ user_id })
          .eq("user_id", pendingProfile[0].user_id);
      } else {
        // No pending profile — create new
        const result = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              user_id,
              email: email || null,
              display_name: display_name || null,
              avatar_url: avatar_url || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();
        profile = result.data;
        profileError = result.error;
      }
    } else {
      // No email, just upsert
      const result = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            user_id,
            email: email || null,
            display_name: display_name || null,
            avatar_url: avatar_url || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();
      profile = result.data;
      profileError = result.error;
    }

    if (profileError) {
      console.error("Profile upsert error:", profileError);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    if (rolesError) {
      console.error("Roles fetch error:", rolesError);
    }

    return new Response(
      JSON.stringify({
        profile,
        roles: (roles || []).map((r: { role: string }) => r.role),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Sync profile error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
