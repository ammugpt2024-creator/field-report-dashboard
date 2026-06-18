import { isQcRole, ROLES } from './permissions';

export function getRoleHomeRoute(role) {
  const normalizedRole = String(role || '').toLowerCase();

  if (normalizedRole === ROLES.PLATFORM_ADMIN) {
    return '/platform-admin';
  }

  if (normalizedRole === ROLES.COMPANY_ADMIN) {
    return '/company-admin';
  }

  if (normalizedRole === ROLES.DEPUTY_PROJECT_MANAGER) {
    return '/manager/dashboard';
  }

  if (normalizedRole === ROLES.INSPECTOR) {
    return '/qc/dashboard';
  }

  if (normalizedRole === ROLES.TECHNICIAN || normalizedRole === ROLES.LAB_TECHNICIAN) {
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
