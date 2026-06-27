// Per-project, per-module access helpers (mirror the company-admin model).
// Levels ladder: none < view < create_edit < approve < manage.
export const MODULE_KEYS = ["daily_logs", "timesheets", "field_test_reports", "lab_reports"];
const LEVEL_ORDER = ["none", "view", "create_edit", "approve", "manage"];

const rank = (lvl) => Math.max(0, LEVEL_ORDER.indexOf(lvl || "none"));

// Admins and platform admins are never gated by project assignments.
export function isUnscoped(companyRole, isPlatformAdmin) {
  return Boolean(isPlatformAdmin) || companyRole === "company_admin";
}

export function meetsLevel(level, required) {
  return rank(level) >= rank(required);
}

// The user's access level for a module on a specific project.
export function moduleLevelForProject(modulePermissions, companyRole, isPlatformAdmin, projectId, module) {
  if (isUnscoped(companyRole, isPlatformAdmin)) return "manage";
  const perms = modulePermissions?.[String(projectId)] || {};
  return perms[module] || "none";
}

// The best level across ALL the user's projects — for global nav visibility.
export function bestModuleLevel(modulePermissions, companyRole, isPlatformAdmin, module) {
  if (isUnscoped(companyRole, isPlatformAdmin)) return "manage";
  let best = "none";
  Object.values(modulePermissions || {}).forEach((perms) => {
    if (rank(perms?.[module]) > rank(best)) best = perms[module];
  });
  return best;
}

// Does the user have at least `required` on `module` on any project?
export function canAccessModule(modulePermissions, companyRole, isPlatformAdmin, module, required = "view") {
  return meetsLevel(bestModuleLevel(modulePermissions, companyRole, isPlatformAdmin, module), required);
}

// Project ids where the user has at least `required` on `module`.
export function projectsWithModuleAccess(modulePermissions, companyRole, isPlatformAdmin, module, required = "create_edit") {
  if (isUnscoped(companyRole, isPlatformAdmin)) return null; // null = all
  return Object.entries(modulePermissions || {})
    .filter(([, perms]) => meetsLevel(perms?.[module], required))
    .map(([projectId]) => projectId);
}
