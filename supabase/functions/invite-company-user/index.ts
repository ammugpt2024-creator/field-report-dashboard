// Sends the Supabase Auth invitation email for a recorded company invite.
// Runs server-side with the service role; the caller must be a platform
// admin or a company admin of the target company.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { email, fullName = "", companyId, redirectTo = "" } = await req.json();
    if (!email || !companyId) {
      return new Response(JSON.stringify({ error: "email and companyId are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate the caller from their JWT and authorize.
    const authHeader = req.headers.get("Authorization") || "";
    const { data: caller } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const [{ data: platformAdmin }, { data: membership }] = await Promise.all([
      admin.from("platform_admins").select("user_id").eq("user_id", caller.user.id).eq("status", "active").maybeSingle(),
      admin.from("company_users").select("role").eq("user_id", caller.user.id).eq("company_id", companyId).eq("status", "active").maybeSingle()
    ]);
    const authorized = Boolean(platformAdmin) || membership?.role === "company_admin";
    if (!authorized) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: redirectTo || undefined
    });

    if (error) {
      // Already-registered users just sign in; the invite row links on login.
      const alreadyExists = /already.*(registered|exists)/i.test(error.message);
      return new Response(JSON.stringify({ sent: false, alreadyExists, error: alreadyExists ? null : error.message }), {
        status: alreadyExists ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    await admin.from("audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.user.id,
      action: "user_invite_email_sent",
      entity_type: "company_user",
      entity_id: invited?.user?.id || email,
      new_value: { email }
    });

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
