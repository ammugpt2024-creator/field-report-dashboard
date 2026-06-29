import { supabase } from './supabase';
import { getReportStatusLabel } from '../constants/reportWorkflow';
import { BRAND, MODULE_NAMES } from '../config/branding';

const DEFAULT_QC_REVIEWER_EMAIL = 'notifications@qcoreapp.com';
// qcoreapp.com is verified in Resend, so emails can go to real recipients;
// the explicit recipient is honored with the QC reviewer address as fallback.
const FORCE_RESEND_TEST_RECIPIENT = false;

// "Jun 01 – Jun 07, 2026" — compact enough for a phone-width email column.
function formatWeekRangeForEmail(start, end) {
  const parse = (v) => (v ? new Date(`${v}T00:00:00`) : null);
  const s = parse(start);
  const e = parse(end);
  if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return [start, end].filter(Boolean).join(' to ') || '-';
  }
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
}

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value instanceof Date ? value : new Date(value));
}

export function baseEmailShell({ title, intro, rows, ctaLabel, ctaUrl, footer = BRAND.name }) {
  const rowHtml = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 10px;color:#64748b;font-weight:700;font-size:13px;width:38%;vertical-align:top;">${label}</td>
        <td style="padding:8px 10px;color:#0f172a;font-weight:600;font-size:14px;">${value || '-'}</td>
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

// Email clients auto-link raw URLs, so a bare signed URL renders as several
// lines of token noise. Wrap it in a short labeled anchor instead.
function secureLinkValue(url, label = 'View the signed PDF') {
  return url
    ? `<a href="${url}" style="color:#2563eb;font-weight:700;text-decoration:underline;">${label}</a>`
    : `Available in ${BRAND.name}`;
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
        ['Secure Link', secureLinkValue(pdfUrl)]
      ],
      ctaLabel: 'Open Validation Workspace',
      ctaUrl: reviewUrl
    })
  };
}

function sumRowHours(row) {
  return Object.values(row?.hours || {}).reduce((total, value) => total + (Number(value) || 0), 0);
}

// Build the approval request for one manager. When `managerRows` is provided the
// email is scoped to that manager's projects only (Fieldglass-style routing: each
// project manager approves their own project's hours).
export function buildTimesheetApprovalEmail({ card, reviewUrl, managerRows = null }) {
  const timesheetNumber = card.timesheetNumber || card.timesheet_number || `TS-${String(card.id || '').slice(0, 8).toUpperCase()}`;
  const scopedRows = Array.isArray(managerRows) ? managerRows : (card.projectRows || []);
  const projects = scopedRows
    .map((row) => {
      const name = row.projectName || row.project_name;
      if (!name) return null;
      return `${name}<br/><span style="color:#475569;">${sumRowHours(row).toFixed(2)} hrs</span>`;
    })
    .filter(Boolean)
    .join('<br/>');
  const scopedTotal = scopedRows.reduce((total, row) => total + sumRowHours(row), 0).toFixed(2);
  const weekTotal = card.totalHours || card.total_hours || '0.00';
  const isScoped = Array.isArray(managerRows) && Number(scopedTotal) !== Number(weekTotal);
  return {
    subject: `[APPROVAL REQUIRED] Timesheet ${timesheetNumber}`,
    html: baseEmailShell({
      title: 'Weekly Timesheet Submitted For Approval',
      intro: isScoped
        ? `A weekly timesheet with hours on your project has been submitted and is awaiting your approval in ${BRAND.name}. Hours for your project are listed below; other projects on this timesheet are routed to their own managers.`
        : `A weekly timesheet has been submitted and is awaiting your approval in ${BRAND.name}.`,
      rows: [
        ['Timesheet', timesheetNumber],
        ['Employee', card.technicianName || card.technician_name],
        ['Week', formatWeekRangeForEmail(card.weekStartDate || card.week_start_date || card.date, card.weekEndDate || card.week_end_date)],
        ['Project Hours', projects || '-'],
        ...(isScoped ? [['To Approve', `${scopedTotal} hrs`]] : []),
        ['Regular', `${card.totalRegularHours || card.total_regular_hours || '0.00'} hrs`],
        ['Overtime', `${card.totalOvertimeHours || card.total_overtime_hours || '0.00'} hrs`],
        ['Week Total', `${weekTotal} hrs`],
        ['Submitted', formatDateTime(card.submittedAt || card.submitted_at || new Date())]
      ],
      ctaLabel: 'Review Timesheet',
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

// Resolve the manager for one project record (same pattern as the concrete log
// flow, which derives the reviewer from project information first).
export async function resolveManagerForProject(projectId) {
  if (!projectId) return null;
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

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
  return null;
}

// Resolve the reviewer the admin set for this submitter on this project
// (project_assignments.reviewer_user_id). Returns { email, name } or null so
// the caller falls back to the company default QC recipient.
export async function resolveAssignmentReviewer(projectId, submitterUserId) {
  if (!projectId || !submitterUserId) return null;
  const { data: asg } = await supabase
    .from('project_assignments')
    .select('reviewer_user_id')
    .eq('project_id', projectId)
    .eq('user_id', submitterUserId)
    .maybeSingle();
  const reviewerId = asg?.reviewer_user_id;
  if (!reviewerId) return null;
  const { data: prof } = await supabase
    .from('profiles').select('email, full_name').eq('id', reviewerId).maybeSingle();
  if (prof?.email) return { id: reviewerId, email: prof.email, name: prof.full_name || 'Reviewer' };
  const { data: cu } = await supabase
    .from('company_users').select('invited_email, full_name').eq('user_id', reviewerId).maybeSingle();
  if (cu?.invited_email) return { id: reviewerId, email: cu.invited_email, name: cu.full_name || 'Reviewer' };
  return { id: reviewerId, email: '', name: 'Reviewer' };
}

// Org-level fallback when a project has no manager assigned.
export async function resolveFallbackManager() {
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
    return { email: assignedManager.email, name: assignedManager.full_name || 'Project Manager' };
  }
  return null;
}

// Notify every project manager whose project carries hours on this timesheet.
// Rows are grouped by their project's manager; each manager receives one approval
// request scoped to their own projects (Fieldglass-style routing). Projects without
// an assigned manager roll up to the org-level fallback manager.
export async function sendTimesheetApprovalEmail(card, { pdfBlob, pdfFileName } = {}) {
  const rows = (card.projectRows || []).filter((row) => row.projectId || row.project_id || row.projectName || row.project_name);
  const managerByProject = new Map();
  let fallbackManager = null;

  async function managerForRow(row) {
    const projectId = row.projectId || row.project_id || null;
    const cacheKey = String(projectId || '');
    if (managerByProject.has(cacheKey)) return managerByProject.get(cacheKey);
    let manager = null;
    try {
      manager = await resolveManagerForProject(projectId);
    } catch (error) {
      console.warn('Project manager lookup from project info failed.', error);
    }
    if (!manager) {
      if (!fallbackManager) {
        try {
          fallbackManager = await resolveFallbackManager();
        } catch (error) {
          console.warn('Fallback manager lookup failed.', error);
        }
      }
      manager = fallbackManager;
    }
    managerByProject.set(cacheKey, manager);
    return manager;
  }

  // Group project rows by recipient email so each manager gets exactly one email.
  const groups = new Map();
  for (const row of rows) {
    const manager = await managerForRow(row);
    const recipientEmail = manager?.email || DEFAULT_QC_REVIEWER_EMAIL;
    if (!groups.has(recipientEmail)) groups.set(recipientEmail, { manager, rows: [] });
    groups.get(recipientEmail).rows.push(row);
  }
  if (!groups.size) groups.set(DEFAULT_QC_REVIEWER_EMAIL, { manager: null, rows });

  const timesheetRef = card.timesheetNumber || card.timesheet_number || card.id || '';
  // Use the deployed app URL when configured; localhost links only work on the dev machine.
  const appBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const reviewUrl = `${appBaseUrl}/manager/dashboard?timesheet=${encodeURIComponent(timesheetRef)}`;
  const results = [];
  for (const [recipientEmail, group] of groups) {
    const email = buildTimesheetApprovalEmail({ card, reviewUrl, managerRows: group.rows });
    const result = await queueAndSendNotification({
      reportId: null,
      recipientEmail,
      subject: email.subject,
      html: email.html,
      notificationType: 'timesheet_approval_required',
      pdfBlob,
      pdfFileName
    });
    results.push(result);
  }
  return results;
}

export function buildTimesheetDecisionEmail({ card, decision, reviewerName, comments, viewUrl }) {
  const timesheetNumber = card.timesheetNumber || card.timesheet_number || `TS-${String(card.id || '').slice(0, 8).toUpperCase()}`;
  const approved = decision === 'approved';
  const weekPeriod = formatWeekRangeForEmail(card.weekStartDate || card.week_start_date, card.weekEndDate || card.week_end_date);
  const rows = [
    ['Timesheet', timesheetNumber],
    ['Employee', card.technicianName || card.technician_name || '-'],
    ['Week', weekPeriod],
    ['Total Hours', `${card.totalHours || card.total_hours || '0.00'} hrs`],
    ['Reviewed By', reviewerName],
    ['Reviewed On', formatDateTime(card.reviewedAt || card.reviewed_at || new Date())],
    ['Status', approved ? 'Approved' : 'Rejected']
  ];
  if (approved) {
    rows.push(['Approved PDF', 'Attached to this email']);
  } else if (comments) {
    rows.push(['Manager Comments', comments]);
  }
  return {
    subject: approved
      ? `[APPROVED] Timesheet ${timesheetNumber}`
      : `[REQUIRES ACTION] Timesheet ${timesheetNumber}`,
    html: baseEmailShell({
      title: approved ? 'Weekly Timesheet Approved' : 'Weekly Timesheet Rejected',
      intro: approved
        ? `${reviewerName} has approved your weekly timesheet. The approved PDF — including the review date — is attached for your records.`
        : `${reviewerName} has rejected your weekly timesheet. Please review the comments below, make the corrections, and resubmit it in ${BRAND.name}.`,
      rows,
      ctaLabel: 'Open My Timesheets',
      ctaUrl: viewUrl
    })
  };
}

// The employee who filed the timesheet. Cards created before user ids were
// stamped fall back to a profile lookup by full name.
async function resolveTimesheetOwner(card) {
  const userId = card.userId || card.user_id || card.technicianUserId || card.technician_user_id || '';
  if (userId) return { recipientUserId: userId, recipientEmail: '' };
  const name = (card.technicianName || card.technician_name || '').trim();
  if (!name) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id,email')
    .eq('full_name', name)
    .limit(1);
  const profile = (data || [])[0];
  if (profile?.email) return { recipientUserId: '', recipientEmail: profile.email };
  if (profile?.id) return { recipientUserId: profile.id, recipientEmail: '' };
  return null;
}

// Notifies the employee that their timesheet was approved or rejected,
// attaching the approved PDF when available.
export async function sendTimesheetDecisionEmail(card, { decision = 'approved', reviewerName = 'Manager', comments = '', pdfBlob = null } = {}) {
  const owner = await resolveTimesheetOwner(card);
  if (!owner) {
    console.warn('Timesheet decision email skipped: employee could not be resolved.', card.technicianName || card.technician_name);
    return null;
  }
  const viewUrl = `${window.location.origin}/timesheets`;
  const { subject, html } = buildTimesheetDecisionEmail({ card, decision, reviewerName, comments, viewUrl });
  const numberPart = String(card.timesheetNumber || card.timesheet_number || card.id || 'timesheet').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return queueAndSendNotification({
    reportId: null,
    recipientEmail: owner.recipientEmail,
    recipientUserId: owner.recipientUserId,
    subject,
    html,
    notificationType: decision === 'approved' ? 'timesheet_approved' : 'timesheet_rejected',
    pdfBlob,
    pdfFileName: pdfBlob ? `Timesheet-${numberPart}-${decision === 'approved' ? 'Approved' : 'Rejected'}.pdf` : undefined
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
        ['Secure Link', secureLinkValue(pdfUrl)]
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

  // Route to the reviewer the admin assigned to this submitter on this project;
  // fall back to the company QC recipient when none is set.
  let toEmail = recipientEmail;
  if (!toEmail) {
    const { data: auth } = await supabase.auth.getUser();
    const submitterId = log.technicianId || log.technician_id || auth?.user?.id;
    const reviewer = await resolveAssignmentReviewer(log.projectId || log.project_id, submitterId);
    if (reviewer?.email) toEmail = reviewer.email;
  }

  return queueAndSendNotification({
    reportId: null,
    recipientEmail: toEmail,
    // Only fall back to the role-based QC recipient when no specific reviewer
    // was resolved for this submitter/project.
    recipientRole: toEmail ? '' : 'qc_manager',
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
        ['Secure Link', secureLinkValue(pdfUrl)]
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
