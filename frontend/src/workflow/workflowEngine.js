import { 
  PencilLine, 
  FileText, 
  Send, 
  Download, 
  Eye, 
  Search, 
  ClipboardCheck, 
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

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

export const ACTION_IDS = {
  CONTINUE_DRAFT: 'continue_draft',
  REVISE_REPORT: 'revise_report',
  OPEN_REPORT: 'open_report',
  PDF_PREVIEW: 'pdf_preview',
  PDF_SUBMITTED: 'pdf_submitted',
  PDF_APPROVED: 'pdf_approved',
  SUBMIT_TO_QC: 'submit_to_qc',
  RESUBMIT_TO_QC: 'resubmit_to_qc',
  DOWNLOAD: 'download',
  DOWNLOAD_FINAL: 'download_final',
  TRACK_STATUS: 'track_status',
  REVIEW: 'review',
  APPROVE: 'approve',
  REJECT: 'reject',
  REQUEST_REVISION: 'request_revision'
};

export const ACTIONS = {
  [ACTION_IDS.CONTINUE_DRAFT]: {
    id: ACTION_IDS.CONTINUE_DRAFT,
    label: 'Continue Report',
    icon: PencilLine,
    intent: 'neutral'
  },
  [ACTION_IDS.REVISE_REPORT]: {
    id: ACTION_IDS.REVISE_REPORT,
    label: 'Revise Report',
    icon: PencilLine,
    intent: 'neutral'
  },
  [ACTION_IDS.OPEN_REPORT]: {
    id: ACTION_IDS.OPEN_REPORT,
    label: 'View Report',
    icon: Eye,
    intent: 'neutral'
  },
  [ACTION_IDS.PDF_PREVIEW]: {
    id: ACTION_IDS.PDF_PREVIEW,
    label: 'PDF Preview',
    icon: FileText,
    intent: 'accent'
  },
  [ACTION_IDS.PDF_SUBMITTED]: {
    id: ACTION_IDS.PDF_SUBMITTED,
    label: 'PDF',
    icon: FileText,
    intent: 'accent'
  },
  [ACTION_IDS.PDF_APPROVED]: {
    id: ACTION_IDS.PDF_APPROVED,
    label: 'Approved PDF',
    icon: FileText,
    intent: 'accent'
  },
  [ACTION_IDS.SUBMIT_TO_QC]: {
    id: ACTION_IDS.SUBMIT_TO_QC,
    label: 'Submit To QC',
    icon: Send,
    intent: 'primary'
  },
  [ACTION_IDS.RESUBMIT_TO_QC]: {
    id: ACTION_IDS.RESUBMIT_TO_QC,
    label: 'Resubmit To QC',
    icon: Send,
    intent: 'primary'
  },
  [ACTION_IDS.DOWNLOAD]: {
    id: ACTION_IDS.DOWNLOAD,
    label: 'Download',
    icon: Download,
    intent: 'outline'
  },
  [ACTION_IDS.DOWNLOAD_FINAL]: {
    id: ACTION_IDS.DOWNLOAD_FINAL,
    label: 'Download Final',
    icon: Download,
    intent: 'primary'
  },
  [ACTION_IDS.TRACK_STATUS]: {
    id: ACTION_IDS.TRACK_STATUS,
    label: 'View Status',
    icon: Search,
    intent: 'neutral'
  },
  [ACTION_IDS.REVIEW]: {
    id: ACTION_IDS.REVIEW,
    label: 'Review',
    icon: ClipboardCheck,
    intent: 'primary'
  },
  [ACTION_IDS.APPROVE]: {
    id: ACTION_IDS.APPROVE,
    label: 'Approve',
    icon: CheckCircle2,
    intent: 'primary'
  },
  [ACTION_IDS.REJECT]: {
    id: ACTION_IDS.REJECT,
    label: 'Reject',
    icon: XCircle,
    intent: 'danger'
  },
  [ACTION_IDS.REQUEST_REVISION]: {
    id: ACTION_IDS.REQUEST_REVISION,
    label: 'Request Revision',
    icon: RotateCcw,
    intent: 'warning'
  }
};

const TECHNICIAN_WORKFLOW = {
  [REPORT_STATUS.DRAFT]: [
    ACTION_IDS.CONTINUE_DRAFT,
    ACTION_IDS.SUBMIT_TO_QC
  ],
  [REPORT_STATUS.GENERATED]: [
    ACTION_IDS.CONTINUE_DRAFT,
    ACTION_IDS.SUBMIT_TO_QC
  ],
  [REPORT_STATUS.SUBMITTED_FOR_QC]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD
  ],
  [REPORT_STATUS.RESUBMITTED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD
  ],
  [REPORT_STATUS.UNDER_REVIEW]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD
  ],
  [REPORT_STATUS.REVISION_REQUIRED]: [
    ACTION_IDS.REVISE_REPORT,
    ACTION_IDS.RESUBMIT_TO_QC
  ],
  [REPORT_STATUS.REJECTED]: [
    ACTION_IDS.REVISE_REPORT,
    ACTION_IDS.RESUBMIT_TO_QC
  ],
  [REPORT_STATUS.APPROVED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD_FINAL
  ],
  [REPORT_STATUS.FINALIZED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD_FINAL
  ]
};

const QC_WORKFLOW = {
  [REPORT_STATUS.SUBMITTED_FOR_QC]: [
    ACTION_IDS.REVIEW,
    ACTION_IDS.PDF_SUBMITTED,
    ACTION_IDS.APPROVE,
    ACTION_IDS.REQUEST_REVISION,
    ACTION_IDS.REJECT
  ],
  [REPORT_STATUS.RESUBMITTED]: [
    ACTION_IDS.REVIEW,
    ACTION_IDS.PDF_SUBMITTED,
    ACTION_IDS.APPROVE,
    ACTION_IDS.REQUEST_REVISION,
    ACTION_IDS.REJECT
  ],
  [REPORT_STATUS.UNDER_REVIEW]: [
    ACTION_IDS.REVIEW,
    ACTION_IDS.PDF_SUBMITTED,
    ACTION_IDS.APPROVE,
    ACTION_IDS.REQUEST_REVISION,
    ACTION_IDS.REJECT
  ],
  [REPORT_STATUS.REVISION_REQUIRED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.PDF_SUBMITTED
  ],
  [REPORT_STATUS.REJECTED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.PDF_SUBMITTED
  ],
  [REPORT_STATUS.APPROVED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD_FINAL
  ],
  [REPORT_STATUS.FINALIZED]: [
    ACTION_IDS.OPEN_REPORT,
    ACTION_IDS.DOWNLOAD_FINAL
  ]
};

export function normalizeReportStatus(value) {
  if (!value) return REPORT_STATUS.DRAFT;
  const normalized = String(value).toUpperCase().trim().replaceAll(' ', '_');
  if (Object.values(REPORT_STATUS).includes(normalized)) return normalized;
  if (normalized === 'IN_PROGRESS') return REPORT_STATUS.DRAFT;
  if (normalized === 'SUBMITTED' || normalized === 'PENDING_QC_APPROVAL' || normalized === 'SUBMITTED_FOR_REVIEW') return REPORT_STATUS.SUBMITTED_FOR_QC;
  if (normalized === 'QC_REVIEW' || normalized === 'UNDER_QA_REVIEW') return REPORT_STATUS.UNDER_REVIEW;
  if (normalized === 'APPROVED') return REPORT_STATUS.APPROVED;
  if (normalized === 'QC_APPROVED' || normalized === 'FINALIZED') return REPORT_STATUS.APPROVED;
  if (normalized === 'QC_REJECTED' || normalized === 'CHANGES_REQUESTED') return REPORT_STATUS.REVISION_REQUIRED;
  return REPORT_STATUS.DRAFT;
}

export function getReportActions(role, status) {
  const normalizedStatus = String(status || REPORT_STATUS.DRAFT).toUpperCase();
  const normalizedRole = String(role || '').toLowerCase();

  const isQc = ['qc', 'qc_approver', 'qc_manager', 'admin'].includes(normalizedRole);
  const workflow = isQc ? QC_WORKFLOW : TECHNICIAN_WORKFLOW;

  const actionIds = workflow[normalizeReportStatus(normalizedStatus)] || [];
  return actionIds.map(id => ACTIONS[id]).filter(Boolean);
}

export function getStatusBadgeConfig(status) {
  const normalized = String(status || REPORT_STATUS.DRAFT).toUpperCase();
  switch (normalized) {
    case REPORT_STATUS.DRAFT:
      return { label: 'Draft', tone: 'slate', icon: PencilLine };
    case REPORT_STATUS.GENERATED:
      return { label: 'Ready To Submit', tone: 'slate', icon: FileText };
    case REPORT_STATUS.SUBMITTED_FOR_QC:
    case 'SUBMITTED':
      return { label: 'Submitted For QC', tone: 'blue', icon: Send };
    case REPORT_STATUS.RESUBMITTED:
      return { label: 'Resubmitted', tone: 'blue', icon: Send };
    case REPORT_STATUS.UNDER_REVIEW:
      return { label: 'Under Review', tone: 'amber', icon: Clock };
    case REPORT_STATUS.APPROVED:
    case REPORT_STATUS.FINALIZED:
      return { label: 'Approved', tone: 'emerald', icon: CheckCircle2 };
    case REPORT_STATUS.REJECTED:
      return { label: 'Rejected', tone: 'red', icon: XCircle };
    case REPORT_STATUS.REVISION_REQUIRED:
      return { label: 'Revision Required', tone: 'amber', icon: RotateCcw };
    default:
      return { label: normalized, tone: 'slate', icon: PencilLine };
  }
}
