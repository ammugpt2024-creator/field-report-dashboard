import { REPORT_STATUS, normalizeReportStatus } from "../../workflow/workflowEngine";

export function getPdfUrl(report) {
  return report?.final_pdf_url || report?.pdf_url || report?.generated_pdf_url || "";
}

export function formatDateTime(value) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

export function isOlderThan(value, hours) {
  if (!value) return false;
  return (Date.now() - new Date(value).getTime()) / 36e5 >= hours;
}

export function priorityForReport(report) {
  if ([REPORT_STATUS.REVISION_REQUIRED, REPORT_STATUS.REJECTED].includes(report.normalizedStatus)) return "High";
  if (isOlderThan(report.updated_at || report.created_at, 24)) return "Elevated";
  return "Normal";
}

export function enrichFieldReports(reports) {
  return reports.map((report) => {
    const normalizedStatus = normalizeReportStatus(report.status);
    return {
      ...report,
      normalizedStatus,
      pdfUrl: getPdfUrl(report),
      priority: priorityForReport({ ...report, normalizedStatus }),
      inspectionType: report.inspection_type || report.report_type || "Concrete Quality Report",
      projectLabel: report.project_name || report.project_number || `Project ${report.project_id || "Unassigned"}`
    };
  });
}

export function getFieldEngineerCollections(reports) {
  const draftReports = reports.filter((report) =>
    [REPORT_STATUS.DRAFT, REPORT_STATUS.GENERATED].includes(report.normalizedStatus)
  );
  const submittedReports = reports.filter((report) =>
    [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus)
  );
  const revisionReports = reports.filter((report) =>
    [REPORT_STATUS.REVISION_REQUIRED, REPORT_STATUS.REJECTED].includes(report.normalizedStatus)
  );
  const approvedReports = reports.filter((report) =>
    [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(report.normalizedStatus)
  );
  const submittedToday = reports.filter((report) => isToday(report.submitted_at || report.updated_at));
  const overdueDrafts = draftReports.filter((report) => isOlderThan(report.updated_at || report.created_at, 24));
  const activeTasks = [
    ...revisionReports.map((report) => ({ type: "Revision required", report, severity: "High" })),
    ...draftReports.filter((report) => !report.pdfUrl).map((report) => ({ type: "Missing attachments or PDF", report, severity: "Normal" })),
    ...overdueDrafts.map((report) => ({ type: "Overdue inspection", report, severity: "Elevated" }))
  ];

  return {
    draftReports,
    submittedReports,
    revisionReports,
    approvedReports,
    submittedToday,
    overdueDrafts,
    activeTasks,
    assignedWork: reports.filter((report) => ![REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(report.normalizedStatus))
  };
}

export function getDefaultProjectId(reports) {
  // No hardcoded fallback project — the technician's assigned project drives the
  // default. Returns null when they have no reports yet.
  return reports.find((report) => report.project_id)?.project_id || null;
}

export function getCurrentProjectLabel(reports) {
  return reports.find((report) => report.projectLabel)?.projectLabel || "";
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}
