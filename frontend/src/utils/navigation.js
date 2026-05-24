import { isQcRole, ROLES } from './permissions';

export function getRoleHomeRoute(role) {
  const normalizedRole = String(role || '').toLowerCase();

  if (normalizedRole === ROLES.TECHNICIAN) {
    return '/technician/dashboard';
  }

  if (normalizedRole === ROLES.ADMIN) {
    return '/admin/dashboard';
  }

  if (normalizedRole === ROLES.CLIENT || normalizedRole === 'client_viewer') {
    return '/client/dashboard';
  }

  if (normalizedRole === ROLES.QC_MANAGER) {
    return '/manager/dashboard';
  }

  if (normalizedRole === 'project_manager' || normalizedRole === 'manager') {
    return '/manager/dashboard';
  }

  if (isQcRole(normalizedRole)) {
    return '/qc/dashboard';
  }

  return '/project/1';
}
