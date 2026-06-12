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

// Permanent removal. Cascades through the company's roster, settings,
// subscription, clients, and equipment. Tenant report tables (projects,
// daily logs, concrete reports, timesheets) reference companies WITHOUT
// cascade, so a company with operational data cannot be deleted — the
// database refuses, and suspension is the right tool instead.
export async function deleteCompany(company) {
  const { error } = await supabase.from('companies').delete().eq('id', company.id);
  if (error) throw error;
  // The company's own audit trail cascades away with it; record the deletion
  // at platform level (no company scope).
  logAuditEvent({
    action: 'company_deleted',
    entityType: 'company',
    entityId: company.id,
    oldValue: { companyName: company.company_name, status: company.status }
  });
}

// Support access is explicit, read-only, and audited.
export async function startSupportSession(companyId, reason) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('platform_support_sessions')
    .insert({ company_id: companyId, platform_admin_id: auth?.user?.id, reason: reason || '', read_only: true })
    .select()
    .single();
  if (error) throw error;
  logAuditEvent({
    companyId,
    action: 'platform_support_access_started',
    entityType: 'platform_support_session',
    entityId: data.id,
    newValue: { reason: reason || '', readOnly: true }
  });
  return data;
}

export async function endSupportSession(sessionRow) {
  const { error } = await supabase
    .from('platform_support_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionRow.id);
  if (error) throw error;
  logAuditEvent({
    companyId: sessionRow.company_id,
    action: 'platform_support_access_ended',
    entityType: 'platform_support_session',
    entityId: sessionRow.id
  });
}

// Fire the Supabase Auth invitation email via the edge function (the service
// role lives server-side). Fire-and-forget: the roster row is the source of
// truth and links itself when the invitee first signs in.
function sendInviteEmail(companyId, email, fullName = '') {
  supabase.functions
    .invoke('invite-company-user', {
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
