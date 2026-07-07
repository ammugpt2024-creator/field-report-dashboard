import { supabase } from './supabase';
import { logAuditEvent } from './auditLogService';
import { baseEmailShell, queueAndSendNotification } from './notificationService';

// Paid Time Off (PTO). Company admins approve; balances are computed from the
// company policy allotment minus approved + pending hours per leave type.

export const PTO_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'unpaid', label: 'Unpaid' }
];
export const ptoTypeLabel = (v) => PTO_TYPES.find((t) => t.value === v)?.label || v;
export const PTO_STATUS_TONES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  denied: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500'
};

// ── Policies (company-wide allotment per type) ──────────────────────────────
export async function listPtoPolicies() {
  const { data, error } = await supabase.from('pto_policies').select('*');
  if (error) { console.warn('PTO policies could not be loaded.', error.message); return []; }
  return data || [];
}

export async function upsertPtoPolicy(companyId, ptoType, annualHours) {
  const { error } = await supabase
    .from('pto_policies')
    .upsert({ company_id: companyId, pto_type: ptoType, annual_hours: Number(annualHours) || 0 }, { onConflict: 'company_id,pto_type' });
  if (error) throw error;
  logAuditEvent({ companyId, action: 'pto_policy_updated', entityType: 'pto_policy', entityId: ptoType, newValue: { annualHours } });
}

// ── Requests ────────────────────────────────────────────────────────────────
export async function listMyPtoRequests() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('pto_requests').select('*').eq('user_id', uid).order('submitted_at', { ascending: false });
  if (error) { console.warn('PTO requests could not be loaded.', error.message); return []; }
  return data || [];
}

// Admin queue: every request in the company.
export async function listCompanyPtoRequests() {
  const { data, error } = await supabase
    .from('pto_requests').select('*').order('submitted_at', { ascending: false });
  if (error) { console.warn('Company PTO requests could not be loaded.', error.message); return []; }
  return data || [];
}

export async function createPtoRequest({ pto_type, start_date, end_date, hours, reason }) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('You must be signed in to request time off.');
  const { data, error } = await supabase
    .from('pto_requests')
    .insert({ user_id: uid, pto_type, start_date, end_date, hours: Number(hours) || 0, reason: reason || '' })
    .select().single();
  if (error) throw error;
  logAuditEvent({ companyId: data.company_id, action: 'pto_requested', entityType: 'pto_request', entityId: data.id, newValue: { pto_type, start_date, end_date, hours } });
  notifyAdminsOfRequest(data, auth?.user).catch((e) => console.warn('PTO request email failed:', e?.message));
  return data;
}

export async function decidePtoRequest(request, decision, comment = '') {
  const { data: auth } = await supabase.auth.getUser();
  const status = decision === 'approved' ? 'approved' : 'denied';
  const { error } = await supabase
    .from('pto_requests')
    .update({ status, reviewed_by: auth?.user?.id || null, reviewed_at: new Date().toISOString(), reviewer_comment: comment || '', updated_at: new Date().toISOString() })
    .eq('id', request.id);
  if (error) throw error;
  logAuditEvent({ companyId: request.company_id, action: `pto_${status}`, entityType: 'pto_request', entityId: request.id, newValue: { status, comment } });
  notifyEmployeeOfDecision(request, status, comment).catch((e) => console.warn('PTO decision email failed:', e?.message));
}

// Employee can cancel their own pending request.
export async function cancelPtoRequest(request) {
  const { error } = await supabase
    .from('pto_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', request.id);
  if (error) throw error;
}

// ── Balances (computed) ─────────────────────────────────────────────────────
// Returns { [type]: { allotment, used, pending, available, is_paid } }.
export function computeBalances(policies, requests) {
  const byType = {};
  PTO_TYPES.forEach((t) => {
    const policy = (policies || []).find((p) => p.pto_type === t.value);
    const mine = (requests || []).filter((r) => r.pto_type === t.value);
    const used = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.hours || 0), 0);
    const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.hours || 0), 0);
    const allotment = policy?.annual_hours || 0;
    byType[t.value] = { allotment, used, pending, available: Math.max(0, allotment - used - pending), is_paid: policy?.is_paid !== false };
  });
  return byType;
}

// ── Notifications ───────────────────────────────────────────────────────────
async function adminRecipients(companyId) {
  const { data } = await supabase
    .from('company_users').select('invited_email, user_id')
    .eq('company_id', companyId).eq('role', 'company_admin').eq('status', 'active');
  const emails = new Set();
  for (const row of data || []) {
    if (row.invited_email) emails.add(row.invited_email);
    if (row.user_id) {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', row.user_id).maybeSingle();
      if (prof?.email) emails.add(prof.email);
    }
  }
  return Array.from(emails);
}

async function notifyAdminsOfRequest(request, user) {
  const employee = user?.user_metadata?.full_name || user?.email || 'An employee';
  const reviewUrl = `${window.location.origin}/company-admin?section=time-off`;
  const { subject, html } = {
    subject: `[APPROVAL REQUIRED] Time-off request — ${employee}`,
    html: baseEmailShell({
      title: 'Time-off request awaiting approval',
      intro: `${employee} submitted a ${ptoTypeLabel(request.pto_type)} request.`,
      rows: [
        ['Employee', employee],
        ['Type', ptoTypeLabel(request.pto_type)],
        ['Dates', `${request.start_date} → ${request.end_date}`],
        ['Hours', String(request.hours)],
        ['Reason', request.reason || '—']
      ],
      ctaLabel: 'Review in QCore',
      ctaUrl: reviewUrl
    })
  };
  const emails = await adminRecipients(request.company_id);
  for (const to of emails) {
    await queueAndSendNotification({ reportId: null, recipientEmail: to, subject, html, notificationType: 'pto_approval_required' });
  }
}

async function notifyEmployeeOfDecision(request, status, comment) {
  const { data: prof } = await supabase.from('profiles').select('email, full_name').eq('id', request.user_id).maybeSingle();
  let to = prof?.email;
  if (!to) {
    const { data: cu } = await supabase.from('company_users').select('invited_email').eq('user_id', request.user_id).maybeSingle();
    to = cu?.invited_email;
  }
  if (!to) return;
  const approved = status === 'approved';
  const { subject, html } = {
    subject: `[${approved ? 'APPROVED' : 'DENIED'}] Your time-off request`,
    html: baseEmailShell({
      title: approved ? 'Time-off approved' : 'Time-off denied',
      intro: approved
        ? `Your ${ptoTypeLabel(request.pto_type)} request has been approved.`
        : `Your ${ptoTypeLabel(request.pto_type)} request was not approved.`,
      rows: [
        ['Type', ptoTypeLabel(request.pto_type)],
        ['Dates', `${request.start_date} → ${request.end_date}`],
        ['Hours', String(request.hours)],
        ...(comment ? [['Note from reviewer', comment]] : [])
      ],
      ctaLabel: 'View in QCore',
      ctaUrl: `${window.location.origin}/`
    })
  };
  await queueAndSendNotification({ reportId: null, recipientEmail: to, subject, html, notificationType: 'pto_decision' });
}
