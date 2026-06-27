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
// company admin(s) that an approval is waiting. Returns the session id plus a
// `notify` result so the UI can show whether the email actually went out.
export async function requestSupportAccess(companyId, scope, reason) {
  const { data, error } = await supabase.rpc('request_support_access', {
    p_company: companyId, p_scope: scope, p_reason: reason || ''
  });
  if (error) throw error;
  let notify;
  try {
    notify = await notifySupportRequest(companyId, scope, reason);
  } catch (e) {
    notify = { ok: false, error: e?.message || 'email failed', sentTo: [] };
  }
  return { sessionId: data, notify };
}

// Email the company's admin(s) that a support-access request needs approval.
// Returns { ok, sentTo, error } — never throws into the request flow.
async function notifySupportRequest(companyId, scope, reason) {
  const { data: company } = await supabase.from('companies').select('company_name').eq('id', companyId).maybeSingle();

  // Company admins: roster invited_email is the reliable source the platform
  // admin can read; also try profiles for any linked accounts.
  const { data: admins } = await supabase
    .from('company_users')
    .select('invited_email, user_id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .eq('status', 'active');
  let emails = (admins || []).map((a) => a.invited_email).filter(Boolean);
  const userIds = (admins || []).map((a) => a.user_id).filter(Boolean);
  if (userIds.length) {
    const { data: profs } = await supabase.from('profiles').select('email').in('id', userIds);
    emails = emails.concat((profs || []).map((p) => p.email).filter(Boolean));
  }
  const to = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!to.length) {
    return { ok: false, error: 'No active company admin with an email to notify.', sentTo: [] };
  }

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

  const { data: result, error } = await supabase.functions.invoke('send-qc-email', {
    body: { to, subject: `QCore: approve support access to your ${label}`, html }
  });
  if (error) {
    // FunctionsHttpError hides the body — surface the real message.
    const body = await error.context?.json?.().catch(() => null);
    return { ok: false, error: body?.error || error.message, sentTo: to };
  }
  if (result?.error) return { ok: false, error: result.error, sentTo: to };
  return { ok: true, sentTo: to };
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
async function sendInviteEmail(companyId, email, fullName = '') {
  try {
    const { data, error } = await supabase.functions.invoke('invite-company-user', {
      // Land directly on /welcome so the invitee always reaches the set-password
      // + claim-invite screen — regardless of whether the link was an invite
      // (new user) or a magic link (existing user added to a new company). The
      // /welcome path is covered by the auth redirect allow-list wildcard.
      body: { companyId, email, fullName, redirectTo: `${window.location.origin}/welcome` }
    });
    if (error) {
      // Surface the function's JSON error body when present (e.g. Resend issues).
      let detail = error.message;
      try { detail = (await error.context?.json())?.error || detail; } catch { /* keep message */ }
      console.warn('Invite email could not be sent:', detail);
      return { ok: false, error: detail };
    }
    return { ok: true, existing: Boolean(data?.existing) };
  } catch (err) {
    console.warn('Invite email could not be sent:', err?.message);
    return { ok: false, error: err?.message || 'Email delivery failed.' };
  }
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
  const delivery = await sendInviteEmail(companyId, email, fullName);
  return { ...data, emailSent: delivery.ok, emailError: delivery.error, existing: delivery.existing };
}

// Re-send the invitation email to an existing roster member (e.g. their link
// expired). Does NOT create another roster row — it just generates a fresh
// link and delivers it via Resend.
export async function resendInvite(companyId, member) {
  const delivery = await sendInviteEmail(companyId, member.invited_email, member.full_name);
  logAuditEvent({
    companyId,
    action: 'user_invite_resent',
    entityType: 'company_user',
    entityId: member.id,
    newValue: { email: member.invited_email }
  });
  return delivery;
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

// Edit an employee's basic details (name + role) in one call.
export async function updateMemberDetails(member, { full_name, role }) {
  const { error } = await supabase
    .from('company_users')
    .update({ full_name, role, updated_at: new Date().toISOString() })
    .eq('id', member.id);
  if (error) throw error;
  logAuditEvent({
    companyId: member.company_id,
    action: 'user_updated',
    entityType: 'company_user',
    entityId: member.id,
    oldValue: { full_name: member.full_name, role: member.role },
    newValue: { full_name, role }
  });
}

// Remove an employee from the company entirely: drop their project assignments
// first, then the roster row. (Their auth account is left intact — they simply
// lose access to this company.)
export async function removeMember(member) {
  if (member.user_id) {
    await supabase.from('project_assignments').delete()
      .eq('company_id', member.company_id).eq('user_id', member.user_id);
  }
  const { error } = await supabase.from('company_users').delete().eq('id', member.id);
  if (error) throw error;
  logAuditEvent({
    companyId: member.company_id,
    action: 'user_removed',
    entityType: 'company_user',
    entityId: member.id,
    oldValue: { email: member.invited_email, role: member.role }
  });
}

// Edit a project's core details.
export async function updateProject(project, fields) {
  const { error } = await supabase.from('projects').update(fields).eq('id', project.id);
  if (error) throw error;
  logAuditEvent({
    companyId: project.company_id,
    action: 'project_updated',
    entityType: 'project',
    entityId: project.id,
    newValue: fields
  });
}

// Delete a project — only when it carries no reports (daily logs / test logs
// reference project_id without a cascade, so a hard delete would orphan them).
// Otherwise the caller should archive (set status) instead.
export async function deleteProject(project) {
  // Server-side count — a company admin can't read technicians' daily_logs under
  // RLS, so this must run with definer rights to be accurate.
  const { data: reportCount, error: countError } = await supabase.rpc('project_report_count', { p_project_id: project.id });
  if (countError) throw countError;
  if ((reportCount || 0) > 0) {
    throw new Error(`This project has ${reportCount} report(s). Archive it instead of deleting, to keep the records intact.`);
  }
  const { error } = await supabase.from('projects').delete().eq('id', project.id);
  if (error) throw error;
  logAuditEvent({
    companyId: project.company_id,
    action: 'project_deleted',
    entityType: 'project',
    entityId: project.id,
    oldValue: { project_name: project.project_name, project_number: project.project_number }
  });
}

// Project assignments for the whole company, joined with the project so the UI
// can show "who is on what". Returns [] on error (e.g. RLS).
const ASSIGNMENT_SELECT = 'id, project_id, user_id, assignment_role, access_level, permissions, projects(project_name, project_number)';

export async function listProjectAssignments() {
  const { data, error } = await supabase
    .from('project_assignments')
    .select(ASSIGNMENT_SELECT);
  if (error) {
    console.warn('Project assignments could not be loaded.', error.message);
    return [];
  }
  return data || [];
}

export async function assignUserToProject(companyId, projectId, userId, assignmentRole, accessLevel, permissions = {}) {
  const { data, error } = await supabase
    .from('project_assignments')
    .insert({ project_id: projectId, user_id: userId, assignment_role: assignmentRole, access_level: accessLevel, permissions })
    .select(ASSIGNMENT_SELECT)
    .single();
  if (error) throw error;
  logAuditEvent({ companyId, action: 'project_assignment_added', entityType: 'project_assignment', entityId: data.id, newValue: { projectId, userId, permissions } });
  return data;
}

// Update a single module's access level on an assignment (merges into the
// existing permissions map).
export async function updateAssignmentPermissions(companyId, assignmentId, permissions) {
  const { error } = await supabase.from('project_assignments').update({ permissions }).eq('id', assignmentId);
  if (error) throw error;
  logAuditEvent({ companyId, action: 'project_assignment_updated', entityType: 'project_assignment', entityId: assignmentId, newValue: { permissions } });
}

export async function updateAssignmentAccess(companyId, assignmentId, accessLevel) {
  const { error } = await supabase.from('project_assignments').update({ access_level: accessLevel }).eq('id', assignmentId);
  if (error) throw error;
  logAuditEvent({ companyId, action: 'project_assignment_updated', entityType: 'project_assignment', entityId: assignmentId, newValue: { accessLevel } });
}

export async function removeProjectAssignment(companyId, assignmentId) {
  const { error } = await supabase.from('project_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
  logAuditEvent({ companyId, action: 'project_assignment_removed', entityType: 'project_assignment', entityId: assignmentId });
}

// ── Role templates (company-level reusable permission presets) ───────────────
export async function listRoles() {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) { console.warn('Roles could not be loaded.', error.message); return []; }
  return data || [];
}

export async function createRole(companyId, { name, description, permissions }) {
  const { data, error } = await supabase
    .from('roles').insert({ name, description: description || '', permissions: permissions || {} })
    .select().single();
  if (error) throw error;
  logAuditEvent({ companyId, action: 'role_created', entityType: 'role', entityId: data.id, newValue: { name, permissions } });
  return data;
}

export async function updateRole(companyId, roleId, { name, description, permissions }) {
  const { error } = await supabase
    .from('roles').update({ name, description: description || '', permissions: permissions || {} })
    .eq('id', roleId);
  if (error) throw error;
  logAuditEvent({ companyId, action: 'role_updated', entityType: 'role', entityId: roleId, newValue: { name, permissions } });
}

export async function deleteRole(companyId, roleId) {
  const { error } = await supabase.from('roles').delete().eq('id', roleId);
  if (error) throw error;
  logAuditEvent({ companyId, action: 'role_deleted', entityType: 'role', entityId: roleId });
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
