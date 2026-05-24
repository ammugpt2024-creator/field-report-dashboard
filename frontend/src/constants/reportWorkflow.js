export const REPORT_STATUS = {
  DRAFT: 'DRAFT',
  GENERATED: 'GENERATED',
  SUBMITTED_FOR_QC: 'SUBMITTED_FOR_QC',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  RESUBMITTED: 'RESUBMITTED',
  FINALIZED: 'FINALIZED'
};

export const REPORT_STATUS_LABELS = {
  [REPORT_STATUS.DRAFT]: 'Draft',
  [REPORT_STATUS.GENERATED]: 'Generated',
  [REPORT_STATUS.SUBMITTED_FOR_QC]: 'Submitted For QC',
  [REPORT_STATUS.UNDER_REVIEW]: 'Under Review',
  [REPORT_STATUS.APPROVED]: 'Approved',
  [REPORT_STATUS.REJECTED]: 'Rejected',
  [REPORT_STATUS.REVISION_REQUIRED]: 'Revision Required',
  [REPORT_STATUS.RESUBMITTED]: 'Resubmitted',
  [REPORT_STATUS.FINALIZED]: 'Approved'
};

export const REPORT_STATUS_TONES = {
  [REPORT_STATUS.DRAFT]: 'slate',
  [REPORT_STATUS.GENERATED]: 'slate',
  [REPORT_STATUS.SUBMITTED_FOR_QC]: 'amber',
  [REPORT_STATUS.UNDER_REVIEW]: 'amber',
  [REPORT_STATUS.APPROVED]: 'emerald',
  [REPORT_STATUS.REJECTED]: 'red',
  [REPORT_STATUS.REVISION_REQUIRED]: 'red',
  [REPORT_STATUS.RESUBMITTED]: 'amber',
  [REPORT_STATUS.FINALIZED]: 'emerald'
};

export function normalizeReportStatus(value) {
  if (!value) return REPORT_STATUS.DRAFT;
  const normalized = String(value).toUpperCase().trim().replaceAll(' ', '_');
  if (Object.values(REPORT_STATUS).includes(normalized)) return normalized;
  if (normalized === 'IN_PROGRESS') return REPORT_STATUS.DRAFT;
  if (normalized === 'SUBMITTED_FOR_REVIEW' || normalized === 'PENDING_QC_APPROVAL' || normalized === 'SUBMITTED') return REPORT_STATUS.SUBMITTED_FOR_QC;
  if (normalized === 'UNDER_QA_REVIEW' || normalized === 'QC_REVIEW') return REPORT_STATUS.UNDER_REVIEW;
  if (normalized === 'CHANGES_REQUESTED' || normalized === 'QC_REJECTED') return REPORT_STATUS.REVISION_REQUIRED;
  if (normalized === 'QC_APPROVED') return REPORT_STATUS.APPROVED;
  return REPORT_STATUS.DRAFT;
}

export function getReportStatusLabel(value) {
  return REPORT_STATUS_LABELS[normalizeReportStatus(value)] || REPORT_STATUS_LABELS[REPORT_STATUS.DRAFT];
}

export function getReportStatusTone(value) {
  return REPORT_STATUS_TONES[normalizeReportStatus(value)] || REPORT_STATUS_TONES[REPORT_STATUS.DRAFT];
}

export function isEditableReportStatus(value) {
  const normalized = normalizeReportStatus(value);
  return normalized === REPORT_STATUS.DRAFT || normalized === REPORT_STATUS.REVISION_REQUIRED;
}

export function isQcQueueStatus(value) {
  return [
    REPORT_STATUS.SUBMITTED_FOR_QC,
    REPORT_STATUS.UNDER_REVIEW,
    REPORT_STATUS.RESUBMITTED
  ].includes(normalizeReportStatus(value));
}

export function isApprovedReportStatus(value) {
  return [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(normalizeReportStatus(value));
}

export function isRejectedReportStatus(value) {
  return [REPORT_STATUS.REJECTED, REPORT_STATUS.REVISION_REQUIRED].includes(normalizeReportStatus(value));
}
