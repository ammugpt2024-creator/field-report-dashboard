import { supabase } from './supabase';
import { getReportStatusLabel } from '../constants/reportWorkflow';
import { BRAND, MODULE_NAMES } from '../config/branding';

const DEFAULT_QC_REVIEWER_EMAIL = 'notifications@qcoreapp.com';
// qcoreapp.com is verified in Resend, so emails can go to real recipients;
// the explicit recipient is honored with the QC reviewer address as fallback.
const FORCE_RESEND_TEST_RECIPIENT = false;

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value instanceof Date ? value : new Date(value));
}

function baseEmailShell({ title, intro, rows, ctaLabel, ctaUrl, footer = BRAND.name }) {
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
          <p style="margin:0 0 8px;letter-spacing:0.22em;text-transform:uppercase;color:#cbd5e1;font-size:12px;">${BRAND.tagline}</p>
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
  const dfr = report.dfr_number || MODULE_NAMES.materialAssurance;
  return {
    subject: `[VALIDATION REQUIRED] ${dfr}`,
    html: baseEmailShell({
      title: 'Concrete Quality Report Ready For Review',
      intro: `A field operations record has been submitted for validation. Please review the attached digital deliverable and complete the decision in ${BRAND.name}.`,
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Submitted By', report.data_logger || report.submitted_by_name],
        ['Submitted On', formatDateTime(report.submitted_at || new Date())],
        ['Status', getReportStatusLabel(report.status)],
        ['Digital Deliverable', 'Attached to this email'],
        ['Secure Link', pdfUrl || `Available in ${BRAND.name}`]
      ],
      ctaLabel: 'Open Validation Workspace',
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

function getDailyLogNumber(log = {}) {
  const explicit = log.logNumber || log.log_number || log.reportNumber || log.report_number;
  if (explicit && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(explicit))) return explicit;
  const projectPart = String(log.projectNumber || log.project_number || 'PROJECT').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const datePart = String(log.date || log.report_date || '').replace(/-/g, '') || 'DATE';
  return `DL-${projectPart}-${datePart}`;
}

export function buildDailyLogReviewEmail({ log, reviewUrl, pdfUrl }) {
  const logNumber = getDailyLogNumber(log);
  const projectName = log.projectName || log.project_name || 'Project';
  const technicianName = log.technicianName || log.technician_name || 'Technician';
  const activities = log.activities || [];
  const reportCount = activities.reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0);
  return {
    subject: `[REVIEW REQUIRED] Daily Field Log ${logNumber} — ${projectName}`,
    html: baseEmailShell({
      title: 'Daily Field Log Submitted For Review',
      intro: `${technicianName} has submitted a Daily Field Log for ${projectName}. The signed PDF — including all activity reports, photos, and attachments — is attached to this email. Please review and approve in ${BRAND.name}.`,
      rows: [
        ['Daily Log #', logNumber],
        ['Project', projectName],
        ['Report Date', log.date || '-'],
        ['Shift', log.shift || '-'],
        ['Technician', technicianName],
        ['Activities', String(activities.length)],
        ['Attached Reports', String(reportCount)],
        ['Submitted On', formatDateTime(log.submittedAt || log.submitted_at || new Date())],
        ['Signed PDF', 'Attached to this email'],
        ['Secure Link', pdfUrl || `Available in ${BRAND.name}`]
      ],
      ctaLabel: 'Open Daily Log Review',
      ctaUrl: reviewUrl
    })
  };
}

// Sends the QC manager the review-request email with the generated, signed
// Daily Log PDF (attachment content already rendered into the PDF body).
export async function sendDailyLogReviewEmail(log, { pdfBlob = null, pdfUrl = '', recipientEmail = '' } = {}) {
  const reviewUrl = `${window.location.origin}/manager/daily-log-review/${log.id}`;
  const { subject, html } = buildDailyLogReviewEmail({ log, reviewUrl, pdfUrl });
  const projectPart = String(log.projectNumber || log.project_number || 'project').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const datePart = String(log.date || '').replace(/[^0-9-]/g, '') || 'date';
  return queueAndSendNotification({
    reportId: null,
    recipientEmail,
    // The QC reviewer is the project manager — resolved from the profiles
    // table by role at send time rather than hardcoded here.
    recipientRole: 'qc_manager',
    subject,
    html,
    notificationType: 'daily_log_review_request',
    pdfBlob,
    pdfFileName: `Daily-Field-Log-${projectPart}-${datePart}.pdf`
  });
}

export function buildDailyLogApprovalEmail({ log, reviewerName, viewUrl, pdfUrl }) {
  const logNumber = getDailyLogNumber(log);
  const projectName = log.projectName || log.project_name || 'Project';
  return {
    subject: `[APPROVED] Daily Field Log ${logNumber} — ${projectName}`,
    html: baseEmailShell({
      title: 'Daily Field Log Approved',
      intro: `${reviewerName} has approved your Daily Field Log for ${projectName}. The countersigned PDF — including both signatures and the approval date — is attached for your records.`,
      rows: [
        ['Daily Log #', logNumber],
        ['Project', projectName],
        ['Report Date', log.date || '-'],
        ['Approved By', reviewerName],
        ['Approved On', formatDateTime(log.approvedAt || log.approved_at || new Date())],
        ['Status', 'Approved'],
        ['Countersigned PDF', 'Attached to this email'],
        ['Secure Link', pdfUrl || `Available in ${BRAND.name}`]
      ],
      ctaLabel: 'View Submitted Log',
      ctaUrl: viewUrl
    })
  };
}

// Notifies the technician who submitted the daily log that it was approved,
// attaching the countersigned PDF. The recipient is resolved server-side from
// their auth user id.
export async function sendDailyLogApprovalEmail(log, { reviewerName = 'Manager', recipientUserId = '', pdfBlob = null, pdfUrl = '' } = {}) {
  const viewUrl = `${window.location.origin}/technician/daily-log/${log.id}/submitted`;
  const { subject, html } = buildDailyLogApprovalEmail({ log, reviewerName, viewUrl, pdfUrl });
  const projectPart = String(log.projectNumber || log.project_number || 'project').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const datePart = String(log.date || '').replace(/[^0-9-]/g, '') || 'date';
  return queueAndSendNotification({
    reportId: null,
    recipientEmail: '',
    recipientUserId,
    subject,
    html,
    notificationType: 'daily_log_approved',
    pdfBlob,
    pdfFileName: `Daily-Field-Log-${projectPart}-${datePart}-Approved.pdf`
  });
}

export function buildApprovalEmail({ report, reviewerName }) {
  const dfr = report.dfr_number || MODULE_NAMES.materialAssurance;
  return {
    subject: `[APPROVED] ${dfr}`,
    html: baseEmailShell({
      title: 'Record Approved',
      intro: 'Your field operations record has been approved.',
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Approved By', reviewerName],
        ['Approved On', formatDateTime(new Date())],
        ['Status', 'Approved']
      ],
      ctaLabel: 'View Digital Deliverable',
      ctaUrl: report.review_url || ''
    })
  };
}

export function buildRejectionEmail({ report, reviewerName, remarks }) {
  const dfr = report.dfr_number || MODULE_NAMES.materialAssurance;
  return {
    subject: `[REQUIRES ACTION] ${dfr}`,
    html: baseEmailShell({
      title: 'Action Required',
      intro: 'Your field operations record requires action before approval.',
      rows: [
        ['DFR #', dfr],
        ['Project', report.project_name],
        ['Reviewed By', reviewerName],
        ['Reviewed On', formatDateTime(new Date())],
        ['Reviewer Remarks', remarks || 'No remarks provided.'],
        ['Status', 'Requires Action']
      ],
      ctaLabel: 'Update Report',
      ctaUrl: report.review_url || ''
    })
  };
}

export async function queueAndSendNotification({
  reportId,
  recipientEmail,
  recipientRole = '',
  recipientUserId = '',
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
        filename: pdfFileName || `${BRAND.name}_Deliverable_${reportId}.pdf`,
        content: await blobToBase64(pdfBlob)
      }]
    : [];

  const { data: invokeData, error: invokeError } = await supabase.functions.invoke('send-qc-email', {
    body: {
      notificationId: queued?.id,
      reportId,
      reviewerEmail: resolvedRecipientEmail,
      // When set, the edge function resolves the actual recipient(s) from the
      // profiles table by role or user id (service role, RLS-proof);
      // reviewerEmail above remains the fallback if no profile matches.
      recipientRole,
      recipientUserId,
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
