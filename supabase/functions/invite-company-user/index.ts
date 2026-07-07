// Invites a company user. Instead of relying on Supabase Auth's built-in email
// sender (rate-limited on the free tier and dependent on custom SMTP), this
// generates the invite/sign-in action link with the service role and delivers
// it through Resend — the same provider that already powers our other email.
// The caller must be a platform admin or a company admin of the target company.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function inviteEmailHtml(opts: { companyName: string; fullName: string; actionLink: string; existing: boolean }) {
  const { companyName, fullName, actionLink, existing } = opts;
  const greeting = fullName ? `Hi ${fullName},` : "Hi,";
  const lead = existing
    ? `You've been added to <strong>${companyName}</strong> on QCore. Sign in to get started.`
    : `You've been invited to join <strong>${companyName}</strong> on QCore. Set your password to activate your account.`;
  const cta = existing ? "Sign in to QCore" : "Accept invitation";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#1d4ed8;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">QCore</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;color:#0f172a;font-weight:600;">${greeting}</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${lead}</p>
          <a href="${actionLink}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;">${cta}</a>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">If the button doesn't work, copy and paste this link into your browser:<br><span style="color:#64748b;word-break:break-all;">${actionLink}</span></p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">This invitation was sent by ${companyName} via QCore. If you weren't expecting it, you can ignore this email.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, fullName = "", companyId, redirectTo = "" } = await req.json();
    if (!email || !companyId) return json({ error: "email and companyId are required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Authenticate + authorize the caller.
    const authHeader = req.headers.get("Authorization") || "";
    const { data: caller } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller?.user?.id) return json({ error: "unauthorized" }, 401);

    const [{ data: platformAdmin }, { data: membership }] = await Promise.all([
      admin.from("platform_admins").select("user_id").eq("user_id", caller.user.id).eq("status", "active").maybeSingle(),
      admin.from("company_users").select("role").eq("user_id", caller.user.id).eq("company_id", companyId).eq("status", "active").maybeSingle()
    ]);
    if (!(Boolean(platformAdmin) || membership?.role === "company_admin")) {
      return json({ error: "forbidden" }, 403);
    }

    // Resolve the company name + the verified sender address.
    const [{ data: company }, { data: fromSetting }] = await Promise.all([
      admin.from("companies").select("company_name").eq("id", companyId).maybeSingle(),
      admin.from("notification_settings").select("value").eq("key", "email_from_address").maybeSingle()
    ]);
    const companyName = company?.company_name || "your company";
    const fromEmail = fromSetting?.value || Deno.env.get("RESEND_FROM_EMAIL") || "QCore <notifications@qcoreapp.com>";

    // Generate the action link WITHOUT triggering Supabase's email sender.
    // New users get an invite link; already-registered users get a magic
    // sign-in link instead (invite would fail with "already registered").
    let actionLink = "";
    let existing = false;
    const inviteRes = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { full_name: fullName }, redirectTo: redirectTo || undefined }
    });
    if (inviteRes.error) {
      if (/already.*(registered|exists)/i.test(inviteRes.error.message)) {
        existing = true;
        const magicRes = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: redirectTo || undefined }
        });
        if (magicRes.error) return json({ error: magicRes.error.message }, 500);
        actionLink = magicRes.data?.properties?.action_link || "";
      } else {
        return json({ error: inviteRes.error.message }, 500);
      }
    } else {
      actionLink = inviteRes.data?.properties?.action_link || "";
    }
    if (!actionLink) return json({ error: "could not generate an invitation link" }, 500);

    // Deliver via Resend.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY is missing on the project." }, 500);
    const resend = new Resend(resendKey);
    const sendRes = await resend.emails.send({
      from: fromEmail,
      to: [String(email)],
      subject: existing ? `You've been added to ${companyName} on QCore` : `You're invited to join ${companyName} on QCore`,
      html: inviteEmailHtml({ companyName, fullName, actionLink, existing })
    });
    if (sendRes.error) return json({ sent: false, error: String(sendRes.error.message || sendRes.error) }, 500);

    await admin.from("audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.user.id,
      action: "user_invite_email_sent",
      entity_type: "company_user",
      entity_id: email,
      new_value: { email, via: "resend", existing }
    });

    return json({ sent: true, existing, deliveryId: sendRes.data?.id || null });
  } catch (error) {
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
