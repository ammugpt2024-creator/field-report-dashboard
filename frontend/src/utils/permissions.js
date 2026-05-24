/**
 * Role-based access control permissions
 * Centralized permission checks for different user roles
 */

export const ROLES = {
  ADMIN: 'admin',
  QC_MANAGER: 'qc_manager',
  QC_APPROVER: 'qc_approver',
  QC: 'qc',
  TECHNICIAN: 'technician',
  VIEWER: 'viewer'
};

export const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 6,
  [ROLES.QC_MANAGER]: 5,
  [ROLES.QC_APPROVER]: 4,
  [ROLES.QC]: 3,
  [ROLES.TECHNICIAN]: 2,
  [ROLES.VIEWER]: 1
};

/**
 * Check if user has a specific role
 */
export function hasRole(userRole, requiredRole) {
  if (!userRole) return false;
  return String(userRole).toLowerCase() === String(requiredRole).toLowerCase();
}

/**
 * Check if user has at least the required role level
 */
export function hasRoleLevel(userRole, minRole) {
  if (!userRole || !minRole) return false;
  const userLevel = ROLE_HIERARCHY[String(userRole).toLowerCase()] || 0;
  const minLevel = ROLE_HIERARCHY[String(minRole).toLowerCase()] || 0;
  return userLevel >= minLevel;
}

/**
 * Check if user is a QC role (any QC level)
 */
export function isQcRole(userRole) {
  return [
    ROLES.QC,
    ROLES.QC_APPROVER,
    ROLES.QC_MANAGER,
    ROLES.ADMIN
  ].includes(String(userRole || '').toLowerCase());
}

/**
 * Check if user is a technician
 */
export function isTechnician(userRole) {
  return hasRole(userRole, ROLES.TECHNICIAN);
}

/**
 * Check if user is an admin
 */
export function isAdmin(userRole) {
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can create reports
 */
export function canCreateReports(userRole) {
  return hasRoleLevel(userRole, ROLES.TECHNICIAN);
}

/**
 * Check if user can edit reports
 */
export function canEditReports(userRole) {
  return hasRoleLevel(userRole, ROLES.TECHNICIAN);
}

/**
 * Check if user can delete reports
 */
export function canDeleteReports(userRole) {
  return hasRoleLevel(userRole, ROLES.QC_MANAGER);
}

/**
 * Check if user can submit reports for QC review
 */
export function canSubmitForReview(userRole) {
  return hasRoleLevel(userRole, ROLES.TECHNICIAN);
}

/**
 * Check if user can review reports (QC approval)
 */
export function canReviewReports(userRole) {
  return isQcRole(userRole);
}

/**
 * Check if user can approve reports
 */
export function canApproveReports(userRole) {
  return [
    ROLES.QC_APPROVER,
    ROLES.QC_MANAGER,
    ROLES.ADMIN
  ].includes(String(userRole || '').toLowerCase());
}

/**
 * Check if user can reject reports
 */
export function canRejectReports(userRole) {
  return isQcRole(userRole);
}

/**
 * Check if user can request changes on reports
 */
export function canRequestChanges(userRole) {
  return isQcRole(userRole);
}

/**
 * Check if user can view audit trail
 */
export function canViewAuditTrail(userRole) {
  return hasRoleLevel(userRole, ROLES.QC);
}

/**
 * Check if user can manage users
 */
export function canManageUsers(userRole) {
  return hasRoleLevel(userRole, ROLES.QC_MANAGER);
}

/**
 * Check if user can manage projects
 */
export function canManageProjects(userRole) {
  return hasRoleLevel(userRole, ROLES.QC_MANAGER);
}

/**
 * Check if user can view all reports (not just their own)
 */
export function canViewAllReports(userRole) {
  return hasRoleLevel(userRole, ROLES.QC);
}

/**
 * Check if user can edit their own reports
 */
export function canEditOwnReports(userRole, reportStatus) {
  if (!canEditReports(userRole)) return false;
  
  const editableStatuses = ['DRAFT', 'REVISION_REQUIRED', 'REJECTED'];
  return editableStatuses.includes(String(reportStatus || 'DRAFT').toUpperCase());
}

/**
 * Check if user can submit reports for QC review
 */
export function canSubmitToQC(userRole, reportStatus) {
  if (!canSubmitForReview(userRole)) return false;
  const submittableStatuses = ['DRAFT', 'REVISION_REQUIRED', 'REJECTED'];
  return submittableStatuses.includes(String(reportStatus || 'DRAFT').toUpperCase());
}

/**
 * Check if user can review a report
 */
export function canReviewReport(userRole, reportStatus) {
  if (!isQcRole(userRole)) return false;
  const reviewableStatuses = ['SUBMITTED_FOR_QC', 'UNDER_REVIEW', 'RESUBMITTED'];
  return reviewableStatuses.includes(String(reportStatus || '').toUpperCase());
}

/**
 * Check if user can approve a report
 */
export function canApproveReport(userRole, reportStatus) {
  if (!canApproveReports(userRole)) return false;
  const approvableStatuses = ['SUBMITTED_FOR_QC', 'UNDER_REVIEW', 'RESUBMITTED'];
  return approvableStatuses.includes(String(reportStatus || '').toUpperCase());
}

/**
 * Get user-friendly role label
 */
export function getRoleLabel(userRole) {
  const labels = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.QC_MANAGER]: 'QC Manager',
    [ROLES.QC_APPROVER]: 'QC Approver',
    [ROLES.QC]: 'QC Reviewer',
    [ROLES.TECHNICIAN]: 'Technician',
    [ROLES.VIEWER]: 'Viewer'
  };
  return labels[String(userRole || '').toLowerCase()] || 'Unknown';
}

/**
 * Check if user can access a specific route
 */
export function canAccessRoute(userRole, route) {
  const routePermissions = {
    '/project/:projectId/qc-review-dashboard': isQcRole,
    '/project/:projectId/field-reports/concrete-test-log/create': canCreateReports,
    '/project/:projectId/field-reports/concrete-test-log/:reportId/edit': canEditReports,
    '/admin': isAdmin,
    '/settings': hasRoleLevel.bind(null, ROLES.QC_MANAGER)
  };

  const permissionFn = routePermissions[route];
  if (!permissionFn) return true; // Default to allow if no specific permission
  return permissionFn(userRole);
}
