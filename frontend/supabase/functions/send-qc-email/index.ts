// Sends QCore notification email through Resend.
//
// SECURITY: this function used to accept any request from anyone -- no caller
// check at all, with verify_jwt off -- so the whole internet could send mail
// from our verified domain to any address, and role-based sends fanned out to
// every company. Every request now has to carry a signed-in user's token, and
// a caller may only mail their own company (platform admins excepted).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

function asEmailList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(normalizeEmail).filter((email) => email.includes("@")))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Email is not configured." }, 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. The caller must be a signed-in user. The anon key alone is a valid
    //    JWT and is published in the app bundle, so it is not identity: only a
    //    token that resolves to a user counts.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: callerData } = token ? await admin.auth.getUser(token) : { data: null };
    const caller = callerData?.user;
    if (!caller?.id) return jsonResponse({ ok: false, error: "Sign in to send notifications." }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.ping === true) return jsonResponse({ ok: true, status: "ok" });

    // 2. Who the caller is allowed to mail.
    const [{ data: platformAdmin }, { data: membership }, { data: callerProfile }] = await Promise.all([
      admin.from("platform_admins").select("user_id").eq("user_id", caller.id).eq("status", "active").maybeSingle(),
      admin.from("company_users").select("company_id").eq("user_id", caller.id).eq("status", "active").maybeSingle(),
      admin.from("profiles").select("email").eq("id", caller.id).maybeSingle()
    ]);
    const isPlatformAdmin = Boolean(platformAdmin);
    const companyId = membership?.company_id || null;
    if (!isPlatformAdmin && !companyId) {
      return jsonResponse({ ok: false, error: "Your account is not an active member of a company." }, 403);
    }

    // Company membership -- not profiles.company_id, which users can edit --
    // decides both who can be mailed and who a role resolves to.
    const companyEmails = new Set<string>();
    if (companyId) {
      const { data: members } = await admin
        .from("company_users")
        .select("invited_email, user_id, profiles:user_id (email, role)")
        .eq("company_id", companyId)
        .eq("status", "active");
      for (const member of members || []) {
        const profile = (member as Record<string, any>).profiles;
        for (const email of [profile?.email, (member as Record<string, any>).invited_email]) {
          const normalized = normalizeEmail(email);
          if (normalized) companyEmails.add(normalized);
        }
      }
    }
    const callerEmail = normalizeEmail(callerProfile?.email || caller.email);
    if (callerEmail) companyEmails.add(callerEmail);

    // The company's own configured notification addresses stay allowed.
    const { data: settingsRows } = await admin
      .from("notification_settings")
      .select("key, value")
      .in("key", ["qc_reviewer_email", "email_from_address"]);
    const settings = new Map((settingsRows || []).map((row: Record<string, any>) => [row.key, row.value]));
    const reviewerSetting = normalizeEmail(settings.get("qc_reviewer_email"));
    if (reviewerSetting) companyEmails.add(reviewerSetting);

    const fromEmail = settings.get("email_from_address") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "QCore <notifications@qcoreapp.com>";

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return jsonResponse({ ok: false, error: "Email is not configured." }, 500);
    }

    // 3. Resolve the recipients.
    let recipients = asEmailList(body.reviewerEmail ?? body.to ?? body.recipientEmail ?? body.recipient_email);

    const recipientRole = String(body.recipientRole || body.recipient_role || "").trim();
    if (recipientRole) {
      // Role sends go to that role WITHIN the caller's company only. This used
      // to query profiles by role across every tenant, so a submitted log was
      // mailed, PDF attached, to other companies' QC managers.
      const roleEmails: string[] = [];
      if (companyId) {
        const { data: roleMembers } = await admin
          .from("company_users")
          .select("profiles:user_id (email, role)")
          .eq("company_id", companyId)
          .eq("status", "active");
        for (const member of roleMembers || []) {
          const profile = (member as Record<string, any>).profiles;
          if (normalizeEmail(profile?.role) === recipientRole.toLowerCase() && profile?.email) {
            roleEmails.push(normalizeEmail(profile.email));
          }
        }
      }
      if (roleEmails.length) recipients = [...new Set(roleEmails)];
      else if (reviewerSetting) recipients = [reviewerSetting];
    }

    const recipientUserId = String(body.recipientUserId || body.recipient_user_id || "");
    if (recipientUserId) {
      const { data: target } = await admin
        .from("profiles")
        .select("id, email")
        .eq("id", recipientUserId)
        .maybeSingle();
      const targetEmail = normalizeEmail(target?.email);
      // Only a member of the caller's company can be addressed this way.
      if (targetEmail && (isPlatformAdmin || companyEmails.has(targetEmail))) {
        recipients = [targetEmail];
      } else if (targetEmail) {
        return jsonResponse({ ok: false, error: "That recipient is not in your company." }, 403);
      }
    }

    if (!isPlatformAdmin) {
      const blocked = recipients.filter((email) => !companyEmails.has(email));
      if (blocked.length) {
        return jsonResponse({ ok: false, error: "Notifications can only be sent to members of your company." }, 403);
      }
    }

    if (!recipients.length) return jsonResponse({ ok: false, error: "No recipient for this notification." }, 400);

    const subject = String(body.subject || "QCore Notification");
    const html = String(body.html || body.body_html || body.message || "");
    if (!html) return jsonResponse({ ok: false, error: "This notification has no content." }, 400);

    const attachments = Array.isArray(body.attachments)
      ? (body.attachments as Record<string, unknown>[]).map((attachment) => ({
          filename: String(attachment?.filename || "report.pdf"),
          content: String(attachment?.content || ""),
        })).filter((attachment) => attachment.content)
      : [];

    const resend = new Resend(resendApiKey);
    const response = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    if (response.error) throw response.error;

    // Log the shape of the send, never its content or addresses.
    console.log("EMAIL SENT", { caller: caller.id, companyId, recipients: recipients.length, attachments: attachments.length });

    return jsonResponse({ ok: true, data: response.data });
  } catch (err) {
    // The message goes to the function log; the caller gets a flat failure.
    // Echoing the error and the request body handed anyone a stack trace and
    // their own payload back.
    console.error("EMAIL ERROR:", err instanceof Error ? err.message : err);
    return jsonResponse({ ok: false, error: "The notification could not be sent." }, 500);
  }
});
