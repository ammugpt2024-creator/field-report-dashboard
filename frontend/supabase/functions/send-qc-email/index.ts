import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// TEMP DEBUG ONLY:
// Paste the real key here briefly to separate a bad/missing secret from a bad Resend key.
// After testing, set this back to "" and use the Supabase secret again.
const HARDCODED_RESEND_KEY = "";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};

  try {
    body = await req.json().catch(() => ({}));
    console.log("REQUEST BODY:", body);

    if (body.ping === true) {
      console.log("HEALTHCHECK: ok");
      return jsonResponse({ status: "ok" });
    }

    const envResendKey = Deno.env.get("RESEND_API_KEY");
    const resendApiKey = HARDCODED_RESEND_KEY || envResendKey;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const admin = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

    // From address comes from the notification_settings table; env and the
    // verified-domain literal are fallbacks only.
    let fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "QCore <notifications@qcoreapp.com>";
    if (admin) {
      const { data: fromSetting, error: fromError } = await admin
        .from("notification_settings")
        .select("value")
        .eq("key", "email_from_address")
        .maybeSingle();
      if (fromError) console.warn("FROM ADDRESS LOOKUP FAILED:", fromError);
      if (fromSetting?.value) fromEmail = fromSetting.value;
    }

    console.log("RESEND KEY EXISTS:", Boolean(envResendKey));
    console.log("HARDCODED RESEND KEY EXISTS:", Boolean(HARDCODED_RESEND_KEY));
    console.log("RESEND KEY SOURCE:", HARDCODED_RESEND_KEY ? "hardcoded" : "env");
    console.log("FROM EMAIL:", fromEmail);

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is missing. Add it with `supabase secrets set RESEND_API_KEY=...`.");
    }

    let to = body.reviewerEmail || body.to || body.recipientEmail || body.recipient_email;
    const recipientRole = String(body.recipientRole || body.recipient_role || "");
    const subject = String(body.subject || "Validation Notification");
    const html = String(body.html || body.body_html || body.message || "");

    // Resolve the recipient from the database by role (e.g. the QC manager /
    // project manager) when one is requested instead of a literal address.
    if (recipientRole && admin) {
      const { data: roleProfiles, error: roleError } = await admin
        .from("profiles")
        .select("email")
        .eq("role", recipientRole)
        .not("email", "is", null);
      if (roleError) console.warn("RECIPIENT ROLE LOOKUP FAILED:", roleError);
      const roleEmails = (roleProfiles || []).map((profile) => String(profile.email || "").trim()).filter(Boolean);
      console.log("RECIPIENT ROLE LOOKUP:", { recipientRole, found: roleEmails.length });
      if (roleEmails.length) {
        to = roleEmails;
      } else {
        // No profile carries the role — use the configured reviewer address.
        const { data: reviewerSetting, error: reviewerError } = await admin
          .from("notification_settings")
          .select("value")
          .eq("key", "qc_reviewer_email")
          .maybeSingle();
        if (reviewerError) console.warn("REVIEWER SETTING LOOKUP FAILED:", reviewerError);
        if (reviewerSetting?.value) {
          to = reviewerSetting.value;
          console.log("RECIPIENT FROM SETTINGS:", reviewerSetting.value);
        }
      }
    }

    // Resolve a specific user's email by their auth id (e.g. the technician
    // who submitted the log, for approval notifications).
    const recipientUserId = String(body.recipientUserId || body.recipient_user_id || "");
    if (recipientUserId && admin) {
      const { data: userProfile, error: userError } = await admin
        .from("profiles")
        .select("email")
        .eq("id", recipientUserId)
        .maybeSingle();
      if (userError) console.warn("RECIPIENT USER LOOKUP FAILED:", userError);
      if (userProfile?.email) {
        to = userProfile.email;
        console.log("RECIPIENT FROM USER ID:", userProfile.email);
      }
    }

    if (!to) throw new Error("Missing recipient email. Expected `to`, a resolvable `recipientRole`, or `recipientUserId`.");
    if (!html) throw new Error("Missing email body. Expected `html`.");

    console.log("RESEND INIT START");
    const resend = new Resend(resendApiKey);
    console.log("RESEND INIT OK");

    const attachments = Array.isArray(body.attachments)
      ? body.attachments.map((attachment) => ({
          filename: String(attachment?.filename || "report.pdf"),
          content: String(attachment?.content || ""),
        })).filter((attachment) => attachment.content)
      : [];

    console.log("ATTACHMENT COUNT:", attachments.length);
    console.log("RESEND SEND START:", { to, subject });
    const response = await resend.emails.send({
      from: fromEmail,
      to: Array.isArray(to) ? to.map(String) : [String(to)],
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    console.log("RESEND API RESPONSE:", response);

    if (response.error) {
      throw response.error;
    }

    return jsonResponse({
      ok: true,
      data: response.data,
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err);

    const error = err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
        }
      : err;

    return jsonResponse({
      ok: false,
      error,
      requestBody: body,
    }, 500);
  }
});
