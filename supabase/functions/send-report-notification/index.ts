import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'QCore <notifications@qcore.local>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey) throw new Error('RESEND_API_KEY is not configured.');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service credentials are not configured.');

    const { notificationId, to, subject, html, reportId, notificationType } = await req.json();
    if (!to || !subject || !html) throw new Error('to, subject, and html are required.');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });

    const resendPayload = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      throw new Error(resendPayload?.message || 'Resend email failed.');
    }

    if (notificationId) {
      const admin = createClient(supabaseUrl, serviceRoleKey);
      await admin
        .from('notification_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', notificationId);
    } else if (reportId) {
      const admin = createClient(supabaseUrl, serviceRoleKey);
      await admin.from('notification_queue').insert({
        report_id: reportId,
        recipient_email: Array.isArray(to) ? to.join(',') : to,
        subject,
        body_html: html,
        notification_type: notificationType || 'manual',
        status: 'sent',
        sent_at: new Date().toISOString()
      });
    }

    return jsonResponse({ ok: true, provider: resendPayload });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: error.message || 'Notification failed.' }, 500);
  }
});
