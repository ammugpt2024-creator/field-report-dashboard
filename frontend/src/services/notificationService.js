import { supabase } from './supabase';
import { getReportStatusLabel } from '../constants/reportWorkflow';

const DEFAULT_QC_REVIEWER_EMAIL = 'ammugpt2024@gmail.com';
const FORCE_RESEND_TEST_RECIPIENT = true;

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value instanceof Date ? value : new Date(value));
}

function baseEmailShell({ title, intro, rows, ctaLabel, ctaUrl, footer = 'QCore QC Platform' }) {
  const rowHtml = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-weight:700;width:170px;">${label}</td>
        <td style="padding:8px 12px;color:#0f172a;font-weight:600;">${value || '-'}</td>
      </tr>
    `)
    .join('');

  return `
    <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ee;border-radius:18px;overflow:hidden;">
        <div style="background:#0f172a;color:#ffffff;padding:24px 28px;">
          <p style="margin:0 0 8px;letter-spacing:0.22em;text-transform:uppercase;color:#cbd5e1;font-size:12px;">Construction QA/QC Workflow</p>
          <h1 style="margin:0;font-size:24px;line-height:1.25;">${title}</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.55;">${intro}</p>
          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            ${rowHtml}
          </table>
          ${ctaUrl ? `
            <p style="margin:26px 0 0;">
              <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px;">
                ${ctaLabel}
              </a>
            </p>
          ` : ''}
          <p style="margin:28px 0 0;color:#64748b;font-size:13px;">Thank you,<br/>${footer}</p>
        </div>
      </div>
    </div>
  `;
}

export function buildQcReviewEmail({ report, reviewUrl, pdfUrl }) {
  const dfr = report.dfr_number || 'Concrete Test Log';
  return {
    subject: `[QC REVIEW REQUIRED] ${dfr}`,
    html: baseEmailShell({
      title: 'Concrete Field Report Ready For QC Review',
      intro: 'A concrete delivery and testing report has been submitted for QA/QC review. Please review the attached PDF snapshot and complete the approval decision in QCore.',
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Submitted By', report.data_logger || report.submitted_by_name],
        ['Submitted On', formatDateTime(report.submitted_at || new Date())],
        ['Status', getReportStatusLabel(report.status)],
        ['PDF Snapshot', 'Attached to this email'],
        ['Secure PDF Link', pdfUrl || 'Available in QCore']
      ],
      ctaLabel: 'Review Report',
      ctaUrl: reviewUrl
    })
  };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read attachment.'));
    reader.readAsDataURL(blob);
  });
}

export function buildApprovalEmail({ report, reviewerName }) {
  const dfr = report.dfr_number || 'Concrete Test Log';
  return {
    subject: `[APPROVED] ${dfr}`,
    html: baseEmailShell({
      title: 'Report Approved',
      intro: 'Your concrete QA/QC report has been approved.',
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Approved By', reviewerName],
        ['Approved On', formatDateTime(new Date())],
        ['Status', 'Approved']
      ],
      ctaLabel: 'View Report',
      ctaUrl: report.review_url || ''
    })
  };
}

export function buildRejectionEmail({ report, reviewerName, remarks }) {
  const dfr = report.dfr_number || 'Concrete Test Log';
  return {
    subject: `[REVISION REQUIRED] ${dfr}`,
    html: baseEmailShell({
      title: 'Revision Required',
      intro: 'Your concrete QA/QC report requires revisions before approval.',
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Reviewed By', reviewerName],
        ['Reviewed On', formatDateTime(new Date())],
        ['Reviewer Remarks', remarks || 'No remarks provided.'],
        ['Status', 'Revision Required']
      ],
      ctaLabel: 'Update Report',
      ctaUrl: report.review_url || ''
    })
  };
}

export async function queueAndSendNotification({
  reportId,
  recipientEmail,
  subject,
  html,
  notificationType,
  pdfBlob,
  pdfFileName,
  invokeEdgeFunction = true
}) {
  const resolvedRecipientEmail = FORCE_RESEND_TEST_RECIPIENT
    ? DEFAULT_QC_REVIEWER_EMAIL
    : recipientEmail || DEFAULT_QC_REVIEWER_EMAIL;
  if (!resolvedRecipientEmail) return null;

  const { data: queued, error } = await supabase
    .from('notification_queue')
    .insert({
      report_id: reportId,
      recipient_email: resolvedRecipientEmail,
      subject,
      body_html: html,
      notification_type: notificationType,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.warn('Notification could not be queued. Has the notification migration been applied?', error);
  }

  if (!invokeEdgeFunction) return queued || null;

  const attachments = pdfBlob
    ? [{
        filename: pdfFileName || `QCore_Report_${reportId}.pdf`,
        content: await blobToBase64(pdfBlob)
      }]
    : [];

  const { data: invokeData, error: invokeError } = await supabase.functions.invoke('send-qc-email', {
    body: {
      notificationId: queued?.id,
      reportId,
      reviewerEmail: resolvedRecipientEmail,
      subject,
      html,
      notificationType,
      attachments
    }
  });

  if (invokeError || invokeData?.ok === false) {
    const errorMessage = invokeError?.message || invokeData?.error?.message || 'Edge function failed.';
    if (queued?.id) {
      await supabase
        .from('notification_queue')
        .update({ status: 'failed', error: errorMessage })
        .eq('id', queued.id);
    }
    console.warn('Notification queued but email send failed.', invokeError || invokeData);
    return queued || null;
  }

  if (queued?.id) {
    await supabase
      .from('notification_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', queued.id);
  }

  return queued || invokeData || null;
}
