import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend";

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
    const fromEmail = "QCore <onboarding@resend.dev>";

    console.log("RESEND KEY EXISTS:", Boolean(envResendKey));
    console.log("HARDCODED RESEND KEY EXISTS:", Boolean(HARDCODED_RESEND_KEY));
    console.log("RESEND KEY SOURCE:", HARDCODED_RESEND_KEY ? "hardcoded" : "env");
    console.log("FROM EMAIL:", fromEmail);

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is missing. Add it with `supabase secrets set RESEND_API_KEY=...`.");
    }

    const to = body.reviewerEmail || body.to || body.recipientEmail || body.recipient_email;
    const subject = String(body.subject || "QC Review Notification");
    const html = String(body.html || body.body_html || body.message || "");

    if (!to) throw new Error("Missing recipient email. Expected `to`.");
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
