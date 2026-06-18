import { supabase } from './supabase';
import { logAuditEvent } from './auditLogService';

// ── Platform admin operations ───────────────────────────────────────────────

export async function listCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('*, company_subscriptions(plan, billing_status, seats, current_period_end)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Single company with its subscription, for the detail drill-in (works on a
// direct URL hit, not just navigation from the list).
export async function getCompanyById(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('*, company_subscriptions(plan, billing_status, seats, current_period_end)')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCompanyUsage(companyId) {
  const { data, error } = await supabase.rpc('get_company_usage', { target_company: companyId });
  if (error) {
    console.warn('Usage could not be loaded for company', companyId, error.message);
    return null;
  }
  return data;
}

// Company onboarding: company record → settings → subscription → first
// Company Admin invitation (roster row; the auth invite email is a
// service-role operation handled outside the browser).
export async function createCompany({
  companyName,
  legalName,
  primaryContactName,
  primaryContactEmail,
  phone,
  address,
  plan = 'trial',
  brandColor = '#1d4ed8',
  status = 'trial'
}) {
  const { data: company, error } = await supabase
    .from('companies')
    .insert({
      company_name: companyName,
      legal_name: legalName || companyName,
      primary_contact_name: primaryContactName || '',
      primary_contact_email: primaryContactEmail || '',
      phone: phone || '',
      address: address || '',
      brand_color: brandColor,
      status
    })
    .select()
    .single();
  if (error) throw error;

  const [settingsRes, subscriptionRes] = await Promise.all([
    supabase.from('company_settings').insert({ company_id: company.id }),
    supabase.from('company_subscriptions').insert({ company_id: company.id, plan })
  ]);
  if (settingsRes.error) console.warn('Company settings could not be created.', settingsRes.error.message);
  if (subscriptionRes.error) console.warn('Subscription could not be created.', subscriptionRes.error.message);

  if (primaryContactEmail) {
    const { error: inviteError } = await supabase.from('company_users').insert({
      company_id: company.id,
      invited_email: primaryContactEmail,
      full_name: primaryContactName || '',
      role: 'company_admin',
      status: 'invited'
    });
    if (inviteError) console.warn('Company admin invite could not be recorded.', inviteError.message);
    sendInviteEmail(company.id, primaryContactEmail, primaryContactName);
  }

  logAuditEvent({
    companyId: company.id,
    action: 'company_created',
    entityType: 'company',
    entityId: company.id,
    newValue: { companyName, plan, status }
  });
  return company;
}

export async function setCompanyStatus(company, nextStatus) {
  const { error } = await supabase
    .from('companies')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', company.id);
  if (error) throw error;
  logAuditEvent({
    companyId: company.id,
    action: nextStatus === 'suspended' ? 'company_suspended' : 'company_status_changed',
    entityType: 'company',
    entityId: company.id,
    oldValue: { status: company.status },
    newValue: { status: nextStatus }
  });
}

export async function setSubscriptionPlan(companyId, plan) {
  const { error } = await supabase
    .from('company_subscriptions')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('company_id', companyId);
  if (error) throw error;
  logAuditEvent({
    companyId,
    action: 'subscription_plan_changed',
    entityType: 'company_subscription',
    entityId: companyId,
    newValue: { plan }
  });
}

// Permanent removal: a full clean sweep of the company's records — projects,
// daily logs, concrete reports, timesheets, roster, exclusive user accounts,
// and every storage file under its tenant prefix. Runs server-side in the
// delete-company edge function (storage needs the service role). Active
// companies are refused; suspend or cancel first. The platform-level audit
// record is written by the SQL sweep itself.
export async function deleteCompany(company) {
  const { data, error } = await supabase.functions.invoke('delete-company', {
    body: { companyId: company.id, confirmName: company.company_name }
  });
  if (error) {
    // FunctionsHttpError hides the body; surface the real message.
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data?.counts || {};
}

// ── Consent-based support access ────────────────────────────────────────────
// Platform admin requests → company admin approves (scoped to specific reports,
// time-limited, optionally name-revealing) → masked read-only viewing. All the
// state transitions and data reads run through SECURITY DEFINER functions so
// the grant and the masking are enforced server-side.

// Support-access report types the platform admin can request.
export const SUPPORT_SCOPES = [
  { value: 'daily_log', label: 'Daily Logs', table: 'daily_logs' },
  { value: 'field_test_report', label: 'Field Test Reports', table: 'concrete_test_logs' },
  { value: 'lab_report', label: 'Lab Reports', table: 'lab_reports' }
];
export function supportScopeLabel(scope) {
  return SUPPORT_SCOPES.find((s) => s.value === scope)?.label || scope;
}

// Platform admin: open a request for a report type (scope), then email the
// company admin(s) that an approval is waiting.
export async function requestSupportAccess(companyId, scope, reason) {
  const { data, error } = await supabase.rpc('request_support_access', {
    p_company: companyId, p_scope: scope, p_reason: reason || ''
  });
  if (error) throw error;
  notifySupportRequest(companyId, scope, reason).catch((e) => console.warn('Support request email failed:', e?.message));
  return data; // session id
}

// Email the company's admin(s) that a support-access request needs approval.
async function notifySupportRequest(companyId, scope, reason) {
  const { data: company } = await supabase.from('companies').select('company_name').eq('id', companyId).maybeSingle();
  const { data: admins } = await supabase
    .from('company_users')
    .select('invited_email')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .eq('status', 'active');
  const to = [...new Set((admins || []).map((a) => (a.invited_email || '').trim()).filter(Boolean))];
  if (!to.length) return;
  const label = supportScopeLabel(scope);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;color:#0f172a">
      <h2 style="margin:0 0 8px">Support access request — approval needed</h2>
      <p style="margin:0 0 12px;color:#475569">QCore Support has requested <b>read-only</b> access to your
      <b>${label}</b> on <b>${company?.company_name || 'your company'}</b> to investigate an issue.</p>
      <p style="margin:0 0 4px"><b>Reason:</b> ${reason || '—'}</p>
      <p style="margin:12px 0 16px;color:#475569">Nothing is shared until you approve and pick exactly which
      reports to expose. Sensitive data stays masked unless you choose otherwise.</p>
      <a href="${origin}/company-admin" style="display:inline-block;background:#2563eb;color:#fff;
      text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Review &amp; approve</a>
    </div>`;
  await supabase.functions.invoke('send-qc-email', {
    body: { to, subject: `QCore: approve support access to your ${label}`, html }
  });
}

// Platform admin: all of MY support sessions for a company, newest first.
export async function listSupportSessions(companyId) {
  const { data, error } = await supabase
    .from('platform_support_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('requested_at', { ascending: false });
  if (error) { console.warn('Support sessions could not be loaded.', error.message); return []; }
  return data || [];
}

// Company admin: pending + active support sessions for THEIR company.
export async function listSupportRequests() {
  const { data, error } = await supabase
    .from('platform_support_sessions')
    .select('*')
    .order('requested_at', { ascending: false });
  if (error) { console.warn('Support requests could not be loaded.', error.message); return []; }
  return data || [];
}

// Company admin: approve a request. resources = [{ id, label }].
export async function approveSupportRequest(sessionId, resources, durationHours, unmask) {
  const { error } = await supabase.rpc('approve_support_request', {
    p_session: sessionId, p_resources: resources, p_duration_hours: durationHours, p_unmask: !!unmask
  });
  if (error) throw error;
}

export async function denySupportRequest(sessionId) {
  const { error } = await supabase.rpc('deny_support_request', { p_session: sessionId });
  if (error) throw error;
}

// Either side ends an active grant.
export async function endSupportSession(sessionRow) {
  const { error } = await supabase.rpc('end_support_session', { p_session: sessionRow.id });
  if (error) throw error;
}

// Platform admin: the masked, read-only contents of one approved record (any
// supported scope: daily log, field test report, or lab report).
export async function getSupportRecord(sessionId, recordId) {
  const { data, error } = await supabase.rpc('get_support_record', { p_session: sessionId, p_record_id: String(recordId) });
  if (error) throw error;
  return data;
}

// Company admin: their own records of a given scope, for the approval picker.
// Returns [{ id, label, sub }] — RLS keeps it to the company's own data.
export async function listCompanyReports(scope) {
  const projectsRes = await supabase.from('projects').select('id, project_name');
  const projectName = Object.fromEntries((projectsRes.data || []).map((p) => [p.id, p.project_name]));

  if (scope === 'field_test_report') {
    const { data, error } = await supabase
      .from('concrete_test_logs')
      .select('id, dfr_number, status, date_sampled, project_id')
      .order('date_sampled', { ascending: false }).limit(200);
    if (error) { console.warn('Field test reports could not be loaded.', error.message); return []; }
    return (data || []).map((r) => ({
      id: r.id,
      label: `${r.dfr_number ? `DFR ${r.dfr_number}` : `Report ${r.id}`} — ${projectName[r.project_id] || 'Project'}`,
      sub: `${r.date_sampled || 'no date'} · ${r.status || 'draft'}`
    }));
  }

  if (scope === 'lab_report') {
    const { data, error } = await supabase
      .from('lab_reports')
      .select('id, report_number, sample_id, test_type, status, break_date')
      .order('break_date', { ascending: false }).limit(200);
    if (error) { console.warn('Lab reports could not be loaded.', error.message); return []; }
    return (data || []).map((r) => ({
      id: r.id,
      label: `${r.report_number || r.sample_id || `Lab ${String(r.id).slice(0, 8)}`} — ${r.test_type || 'test'}`,
      sub: `${r.break_date || 'no date'} · ${r.status || 'draft'}`
    }));
  }

  // default: daily_log
  const { data, error } = await supabase
    .from('daily_logs')
    .select('id, log_date, status, project_id')
    .order('log_date', { ascending: false }).limit(200);
  if (error) { console.warn('Daily logs could not be loaded.', error.message); return []; }
  return (data || []).map((l) => ({
    id: l.id,
    label: `${projectName[l.project_id] || 'Project'} — ${l.log_date || 'no date'}`,
    sub: l.status || 'draft'
  }));
}

// Fire the Supabase Auth invitation email via the edge function (the service
// role lives server-side). Fire-and-forget: the roster row is the source of
// truth and links itself when the invitee first signs in.
function sendInviteEmail(companyId, email, fullName = '') {
  supabase.functions
    .invoke('invite-company-user', {
      // Origin only: it is already on the auth redirect allow-list, and the
      // app routes invite-token landings to /welcome itself.
      body: { companyId, email, fullName, redirectTo: window.location.origin }
    })
    .then(({ data, error }) => {
      if (error) console.warn('Invite email could not be sent:', error.message);
      else if (data?.alreadyExists) console.info('Invitee already has an account; they can sign in directly.');
    })
    .catch((error) => console.warn('Invite email could not be sent:', error?.message));
}

// ── Company admin operations ────────────────────────────────────────────────

export async function getMyCompanyContext() {
  const [companyRes, subscriptionRes, settingsRes, rosterRes] = await Promise.all([
    supabase.from('companies').select('*').maybeSingle(),
    supabase.from('company_subscriptions').select('*').maybeSingle(),
    supabase.from('company_settings').select('*').maybeSingle(),
    supabase.from('company_users').select('*').order('created_at', { ascending: true })
  ]);
  return {
    company: companyRes.data || null,
    subscription: subscriptionRes.data || null,
    settings: settingsRes.data || null,
    roster: rosterRes.data || []
  };
}

export async function updateCompanyProfile(companyId, patch, previous = {}) {
  const { error } = await supabase
    .from('companies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', companyId);
  if (error) throw error;
  logAuditEvent({
    companyId,
    action: 'company_profile_updated',
    entityType: 'company',
    entityId: companyId,
    oldValue: previous,
    newValue: patch
  });
}

export async function setMemberRole(member, nextRole) {
  const { error } = await supabase
    .from('company_users')
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq('id', member.id);
  if (error) throw error;
  logAuditEvent({
    companyId: member.company_id,
    action: 'user_role_changed',
    entityType: 'company_user',
    entityId: member.id,
    oldValue: { role: member.role },
    newValue: { role: nextRole }
  });
}

export async function inviteMember(companyId, { email, fullName, role }) {
  const { data, error } = await supabase
    .from('company_users')
    .insert({ company_id: companyId, invited_email: email, full_name: fullName || '', role, status: 'invited' })
    .select()
    .single();
  if (error) throw error;
  logAuditEvent({
    companyId,
    action: 'user_invited',
    entityType: 'company_user',
    entityId: data.id,
    newValue: { email, role }
  });
  sendInviteEmail(companyId, email, fullName);
  return data;
}

export async function setMemberStatus(member, nextStatus) {
  const { error } = await supabase
    .from('company_users')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', member.id);
  if (error) throw error;
  logAuditEvent({
    companyId: member.company_id,
    action: nextStatus === 'disabled' ? 'user_disabled' : 'user_updated',
    entityType: 'company_user',
    entityId: member.id,
    oldValue: { status: member.status },
    newValue: { status: nextStatus }
  });
}

// Generic company-scoped CRUD used by the Company Admin sections.
export async function listCompanyRows(table, orderBy = 'created_at') {
  const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending: false });
  if (error) {
    console.warn(`${table} could not be loaded.`, error.message);
    return [];
  }
  return data || [];
}

export async function insertCompanyRow(table, companyId, row, auditAction) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  if (auditAction) {
    logAuditEvent({ companyId, action: auditAction, entityType: table, entityId: data.id, newValue: row });
  }
  return data;
}

export async function updateCompanyRow(table, companyId, id, patch, auditAction) {
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw error;
  if (auditAction) {
    logAuditEvent({ companyId, action: auditAction, entityType: table, entityId: id, newValue: patch });
  }
}
