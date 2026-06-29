import { supabase } from './supabase';

let cachedCompanyId = null;
async function resolveCompanyId() {
  if (cachedCompanyId) return cachedCompanyId;
  const { data } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('status', 'active')
    .maybeSingle();
  cachedCompanyId = data?.company_id || null;
  return cachedCompanyId;
}

// Tenant audit trail (public.audit_logs). Fire-and-forget: auditing must
// never block or fail the business action it describes.
export async function logAuditEvent({
  companyId = null,
  action,
  entityType = null,
  entityId = null,
  oldValue = null,
  newValue = null
}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const resolvedCompanyId = companyId || (await resolveCompanyId());
    const { error } = await supabase.from('audit_logs').insert({
      company_id: resolvedCompanyId,
      actor_user_id: auth?.user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId == null ? null : String(entityId),
      old_value: oldValue,
      new_value: newValue
    });
    if (error) console.warn('Audit event could not be recorded:', action, error.message);
  } catch (error) {
    console.warn('Audit event could not be recorded:', action, error?.message);
  }
}

export async function fetchAuditLogs({ companyId = null, limit = 50 } = {}) {
  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.warn('Audit logs could not be loaded.', error.message);
    return [];
  }
  return data || [];
}
