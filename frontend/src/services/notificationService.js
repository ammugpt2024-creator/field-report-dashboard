import { supabase } from './supabase';
import { getReportStatusLabel } from '../constants/reportWorkflow';
import { BRAND, MODULE_NAMES } from '../config/branding';

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

export function buildTimesheetApprovalEmail({ card, reviewUrl }) {
  const timesheetNumber = card.timesheetNumber || card.timesheet_number || `TS-${String(card.id || '').slice(0, 8).toUpperCase()}`;
  const projects = (card.projectRows || [])
    .map((row) => row.projectName || row.project_name)
    .filter(Boolean)
    .join(', ');
  return {
    subject: `[APPROVAL REQUIRED] Timesheet ${timesheetNumber}`,
    html: baseEmailShell({
      title: 'Weekly Timesheet Submitted For Approval',
      intro: `A weekly timesheet has been submitted and is awaiting your approval in ${BRAND.name}.`,
      rows: [
        ['Timesheet #', timesheetNumber],
        ['Employee', card.technicianName || card.technician_name],
        ['Week', `${card.weekStartDate || card.week_start_date || card.date || '-'} to ${card.weekEndDate || card.week_end_date || '-'}`],
        ['Projects', projects],
        ['Regular Hours', card.totalRegularHours || card.total_regular_hours || '0.00'],
        ['Overtime Hours', card.totalOvertimeHours || card.total_overtime_hours || '0.00'],
        ['Total Hours', card.totalHours || card.total_hours || '0.00'],
        ['Submitted On', formatDateTime(card.submittedAt || card.submitted_at || new Date())]
      ],
      ctaLabel: 'Open Manager Dashboard',
      ctaUrl: reviewUrl
    })
  };
}

const PROJECT_MANAGER_ROLES = ['project_manager', 'manager', 'qc_manager', 'admin'];
const PROJECT_MANAGER_EMAIL_COLUMNS = [
  'project_manager_email', 'manager_email', 'pm_email',
  'project_manager', 'manager', 'pm'
];
const PROJECT_MANAGER_ID_COLUMNS = ['project_manager_id', 'manager_id', 'pm_id'];

function looksLikeEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Resolve the manager for a timesheet from its project record (same pattern as the
// concrete log flow, which derives the reviewer from project information first).
async function resolveProjectManagerForCard(card) {
  const projectIds = Array.from(new Set(
    (card.projectRows || [])
      .map((row) => row.projectId || row.project_id)
      .filter(Boolean)
  ));

  for (const projectId of projectIds) {
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) continue;

    for (const column of PROJECT_MANAGER_EMAIL_COLUMNS) {
      if (looksLikeEmail(project[column])) {
        return { email: project[column].trim(), name: project.project_manager_name || project.manager_name || 'Project Manager' };
      }
    }
    for (const column of PROJECT_MANAGER_ID_COLUMNS) {
      if (!project[column]) continue;
      const { data: managerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', project[column])
        .maybeSingle();
      if (managerProfile?.email) {
        return { email: managerProfile.email, name: managerProfile.full_name || 'Project Manager' };
      }
    }
  }
  return null;
}

// Notify the assigned project manager that a timesheet needs approval.
// Timesheets are not rows in concrete_test_logs, so the queue entry carries no report_id.
export async function sendTimesheetApprovalEmail(card, { pdfBlob, pdfFileName } = {}) {
  // 1) Manager derived from the project record itself.
  let manager = null;
  try {
    manager = await resolveProjectManagerForCard(card);
  } catch (error) {
    console.warn('Project manager lookup from project info failed.', error);
  }

  // 2) Fall back to any profile holding a manager role.
  if (!manager) {
    const { data: managerProfiles } = await supabase
      .from('profiles')
      .select('*')
      .in('role', PROJECT_MANAGER_ROLES);
    const assignedManager =
      (managerProfiles || []).find((item) => item.role === 'project_manager') ||
      (managerProfiles || []).find((item) => item.role === 'manager') ||
      (managerProfiles || []).find((item) => item.role === 'qc_manager') ||
      (managerProfiles || [])[0] ||
      null;
    if (assignedManager?.email) {
      manager = { email: assignedManager.email, name: assignedManager.full_name || 'Project Manager' };
    }
  }

  const email = buildTimesheetApprovalEmail({
    card,
    reviewUrl: `${window.location.origin}/manager/dashboard`
  });
  return queueAndSendNotification({
    reportId: null,
    recipientEmail: manager?.email || DEFAULT_QC_REVIEWER_EMAIL,
    subject: email.subject,
    html: email.html,
    notificationType: 'timesheet_approval_required',
    pdfBlob,
    pdfFileName
  });
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
