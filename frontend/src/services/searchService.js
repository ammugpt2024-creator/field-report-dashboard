import { supabase } from './supabase';

// Global search across projects, daily logs, and field test reports.
//
// ACCESS SCOPING: every query runs through the caller's authenticated session,
// so row-level security applies automatically — a technician only matches their
// own logs and their company's projects, a manager only their company's data,
// and no one ever sees another tenant's records. We do NOT widen access here;
// search can only surface what the user is already permitted to read.
export async function globalSearch(term) {
  const q = (term || '').trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%,]/g, '')}%`;

  const [projectsRes, reportsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, project_name, project_number, project_location')
      .or(`project_name.ilike.${like},project_number.ilike.${like}`)
      .limit(6),
    supabase
      .from('concrete_test_logs')
      .select('id, dfr_number, status, project_id')
      .ilike('dfr_number', like)
      .limit(6)
  ]);

  const projects = (projectsRes.data || []).map((p) => ({
    type: 'project',
    id: p.id,
    title: p.project_name || `Project ${p.id}`,
    subtitle: [p.project_number ? `#${p.project_number}` : null, p.project_location].filter(Boolean).join(' · '),
    projectId: p.id
  }));

  // Daily logs under the matched projects (RLS still applies on daily_logs).
  let dailyLogs = [];
  const projectIds = projects.map((p) => p.projectId);
  if (projectIds.length) {
    const { data } = await supabase
      .from('daily_logs')
      .select('id, log_date, status, project_id')
      .in('project_id', projectIds)
      .order('log_date', { ascending: false })
      .limit(6);
    const nameById = Object.fromEntries(projects.map((p) => [p.projectId, p.title]));
    dailyLogs = (data || []).map((l) => ({
      type: 'daily_log',
      id: l.id,
      title: nameById[l.project_id] || 'Daily Log',
      subtitle: [l.log_date, l.status].filter(Boolean).join(' · '),
      projectId: l.project_id
    }));
  }

  const reports = (reportsRes.data || []).map((r) => ({
    type: 'report',
    id: r.id,
    title: `Field Test ${r.dfr_number || r.id}`,
    subtitle: r.status || '',
    projectId: r.project_id
  }));

  return [...projects, ...dailyLogs, ...reports];
}
