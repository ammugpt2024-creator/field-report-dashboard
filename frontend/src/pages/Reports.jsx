import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Search, Calendar, Inbox, FolderKanban } from 'lucide-react';
import { isQcRole } from '../utils/permissions';
import StatusBadge from '../components/StatusBadge';
import ReportActions from '../components/ReportActions';
import { ACTION_IDS, normalizeReportStatus } from '../workflow/workflowEngine';
import { BRAND, MODULE_NAMES, WORKFLOW_LABELS } from '../config/branding';

const REPORT_REGISTER_STATUSES = [
  'GENERATED',
  'SUBMITTED_FOR_QC',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'RESUBMITTED',
  'SUBMITTED_FOR_REVIEW',
  'UNDER_QA_REVIEW',
  'PENDING_QC_APPROVAL',
  'APPROVED',
  'FINALIZED',
  'REJECTED'
];

function getReportPdfUrlValue(report) {
  return report?.final_pdf_url || report?.pdf_url || report?.generated_pdf_url || '';
}

function isReportRegisterEntry(report) {
  return Boolean(getReportPdfUrlValue(report)) || REPORT_REGISTER_STATUSES.includes(normalizeReportStatus(report.status));
}

function toSafeStorageName(value) {
  return String(value || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'project';
}

function getProjectStorageFolder(report, projectId) {
  const projectName = toSafeStorageName(report?.project_name);
  const projectNumber = toSafeStorageName(report?.project_number);
  if (projectName && projectNumber) return `${projectName}_${projectNumber}`;
  return `project_${projectId}`;
}

async function findStoredReportPdf(report, projectId) {
  if (getReportPdfUrlValue(report)) {
    return {
      url: getReportPdfUrlValue(report),
      updatedAt: report.updated_at || report.created_at
    };
  }

  const projectFolder = getProjectStorageFolder(report, projectId);
  const candidateFolders = [
    `${projectFolder}/concrete-test-logs/log_${report.id}/pdf`,
    `project-${projectId}/concrete-test-logs/log_${report.id}/pdf`,
    `project_${projectId}/concrete-test-logs/log_${report.id}/pdf`
  ];

  for (const folder of candidateFolders) {
    const { data, error } = await supabase.storage.from('report-pdfs').list(folder, {
      limit: 10,
      sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error || !Array.isArray(data)) continue;
    const pdfFile = data.find((item) => /\.pdf$/i.test(item.name));
    if (!pdfFile) continue;

    const path = `${folder}/${pdfFile.name}`;
    const { data: signedData } = await supabase.storage.from('report-pdfs').createSignedUrl(path, 60 * 60 * 24);
    const publicData = supabase.storage.from('report-pdfs').getPublicUrl(path).data;
    return {
      url: signedData?.signedUrl || publicData?.publicUrl || '',
      path,
      updatedAt: pdfFile.updated_at || pdfFile.created_at || report.created_at
    };
  }

  return null;
}

function Reports() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [hiddenDraftCount, setHiddenDraftCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  useEffect(() => {
    async function fetchReports() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('concrete_test_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('id', { ascending: false });

      if (error) {
        console.error('Error fetching reports:', error);
      } else {
        const reportRows = data || [];
        const reportIds = reportRows.map((report) => report.id);
        let specificationsByLogId = {};
        if (reportIds.length > 0) {
          const { data: specificationsData, error: specificationsError } = await supabase
            .from('concrete_specifications')
            .select('log_id,dfr_number')
            .in('log_id', reportIds);
          if (!specificationsError) {
            specificationsByLogId = (specificationsData || []).reduce((state, specification) => {
              state[specification.log_id] = specification;
              return state;
            }, {});
          }
        }

        const mappedReports = reportRows.map((report) => ({
          ...report,
          dfr_number: report.dfr_number || specificationsByLogId[report.id]?.dfr_number || ''
        }));
        const mappedReportsWithPdfs = await Promise.all(
          mappedReports.map(async (report) => {
            const storedPdf = await findStoredReportPdf(report, projectId);
            if (!storedPdf) return report;
            return {
              ...report,
              generated_pdf_url: storedPdf.url,
              generated_pdf_storage_path: storedPdf.path,
              generated_pdf_updated_at: storedPdf.updatedAt,
              status: report.status || 'GENERATED'
            };
          })
        );
        const registerReports = mappedReportsWithPdfs.filter(isReportRegisterEntry);
        setReports(registerReports);
        setHiddenDraftCount(mappedReportsWithPdfs.length - registerReports.length);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
    }

    fetchReports();
  }, [projectId]);

  const formatTimestamp = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString();
  };

  const normalizeStatus = normalizeReportStatus;

  const filteredReports = reports.filter((report) => {
    const lowerSearch = search.toLowerCase();
    const matchesSearch =
      (report.dfr_number || '').toLowerCase().includes(lowerSearch) ||
      (report.project_name || '').toLowerCase().includes(lowerSearch) ||
      (report.data_logger || '').toLowerCase().includes(lowerSearch);

    const normalizedFilter = normalizeStatus(statusFilter);
    const matchesStatus =
      statusFilter === 'all' || normalizeStatus(report.status) === normalizedFilter;
    const matchesTechnician = technicianFilter === 'all' || report.data_logger === technicianFilter;
    const matchesDate = !dateFilter || report.date_sampled === dateFilter;

    return matchesSearch && matchesStatus && matchesTechnician && matchesDate;
  });

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, technicianFilter, dateFilter]);

  const uniqueTechnicians = Array.from(
    new Set(reports.map((report) => report.data_logger).filter(Boolean))
  );

  const getReportPdfUrl = getReportPdfUrlValue;

  const isQcUser = isQcRole(role);
  const getDashboardActions = (report) => {
    if (!isQcUser) return null;
    const reportStatus = normalizeStatus(report.status);
    if (['SUBMITTED_FOR_QC', 'UNDER_REVIEW', 'RESUBMITTED'].includes(reportStatus)) {
      return [ACTION_IDS.REVIEW];
    }
    if (['APPROVED', 'FINALIZED'].includes(reportStatus)) {
      return [ACTION_IDS.OPEN_REPORT, ACTION_IDS.DOWNLOAD_FINAL];
    }
    return [ACTION_IDS.OPEN_REPORT];
  };

  const handleReportAction = (actionId, report) => {
    const editRoute = `/project/${projectId}/field-reports/concrete-test-log/${report.id}/edit`;
    const viewRoute = `/project/${projectId}/field-reports/concrete-test-log/${report.id}`;
    const reviewRoute = `/qc/review/${report.id}`;

    switch (actionId) {
      case ACTION_IDS.CONTINUE_DRAFT:
      case ACTION_IDS.REVISE_REPORT:
        navigate(editRoute);
        break;
      case ACTION_IDS.OPEN_REPORT:
        navigate(viewRoute);
        break;
      case ACTION_IDS.REVIEW:
        navigate(reviewRoute);
        break;
      case ACTION_IDS.TRACK_STATUS:
        navigate(viewRoute); // For now, track status leads to view
        break;
      case ACTION_IDS.SUBMIT_TO_QC:
      case ACTION_IDS.RESUBMIT_TO_QC:
        navigate(editRoute); // Lead to edit/submit page
        break;
      default:
        console.log('Action not handled in dashboard:', actionId);
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-5 sm:space-y-8">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">{BRAND.name}</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">{MODULE_NAMES.digitalDeliverables}</h1>
              <p className="mt-2 text-slate-600">
                {isQcUser
                  ? 'Review submitted assurance records, open digital deliverables, and approve or return work.'
                  : 'Track generated, submitted, and approved digital deliverables.'}
              </p>
              {hiddenDraftCount > 0 && (
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {hiddenDraftCount} autosaved draft {hiddenDraftCount === 1 ? 'session is' : 'sessions are'} hidden because no PDF has been generated yet.
                </p>
              )}
            </div>

            <div className="flex w-full flex-col gap-4 lg:w-auto">
              <button
                type="button"
                onClick={() => navigate(`/project/${projectId}`)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:w-auto lg:self-end"
              >
                <FolderKanban className="h-4 w-4" />
                {MODULE_NAMES.projectHub}
              </button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Generated Deliverables</p>
                <p className="mt-2 text-2xl font-semibold">{reports.length}</p>
              </div>
              <div className="rounded-3xl bg-sky-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{WORKFLOW_LABELS.submittedForValidation}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {reports.filter((r) => {
                    const status = normalizeStatus(r.status);
                    return status === 'SUBMITTED_FOR_QC' || status === 'UNDER_REVIEW' || status === 'RESUBMITTED';
                  }).length}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Approved</p>
                <p className="mt-2 text-2xl font-semibold">
                  {reports.filter((r) => {
                    const status = normalizeStatus(r.status);
                    return status === 'APPROVED' || status === 'FINALIZED';
                  }).length}
                </p>
              </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Search</span>
              <div className="mt-2 relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search DFR, project, or field engineer"
                  className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="generated">Generated</option>
                <option value="submitted_for_qc">{WORKFLOW_LABELS.submittedForValidation}</option>
                <option value="under_review">Under Review</option>
                <option value="revision_required">{WORKFLOW_LABELS.revisionRequired}</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="approved">Approved</option>
                <option value="finalized">Finalized</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Field Engineer</span>
              <select
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="all">All</option>
                {uniqueTechnicians.map((tech) => (
                  <option key={tech} value={tech}>{tech}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Date</span>
              <div className="mt-2 relative">
                <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200 sm:p-6">
          <div className="hidden lg:block">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">DFR #</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Field Engineer</th>
                  <th className="px-4 py-3 font-semibold">Sample Date</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{report.dfr_number || 'N/A'}</p>
                    </td>
                    <td className="px-4 py-4">{report.project_name || 'Unknown project'}</td>
                    <td className="px-4 py-4">{report.data_logger || 'Unassigned'}</td>
                    <td className="px-4 py-4">{report.date_sampled || '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{formatTimestamp(report.updated_at || report.generated_pdf_updated_at || report.created_at)}</td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-4">
                      <ReportActions 
                        role={role}
                        status={report.status}
                        pdfUrl={getReportPdfUrl(report)}
                        onAction={(id) => handleReportAction(id, report)}
                        allowedActions={getDashboardActions(report)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 lg:hidden">
            {paginatedReports.map((report) => (
              <div key={report.id} className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold text-slate-900 sm:text-lg">{report.dfr_number || 'N/A'}</p>
                    <p className="text-sm text-slate-600">{report.project_name || 'Unknown project'}</p>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
                <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Field Engineer</p>
                    <p className="font-medium text-slate-900">{report.data_logger || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Sample Date</p>
                    <p className="font-medium text-slate-900">{report.date_sampled || '—'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">Updated</p>
                    <p className="font-medium text-slate-900">{formatTimestamp(report.updated_at || report.generated_pdf_updated_at || report.created_at)}</p>
                  </div>
                </div>
                <ReportActions 
                  role={role}
                  status={report.status}
                  pdfUrl={getReportPdfUrl(report)}
                  onAction={(id) => handleReportAction(id, report)}
                  isMobile={true}
                  allowedActions={getDashboardActions(report)}
                />
              </div>
            ))}
          </div>

          {!loading && filteredReports.length === 0 && (
            <div className="mt-12 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              <Inbox className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-lg font-semibold">No matching reports found</p>
              <p className="mt-2 text-sm">Try clearing filters or creating a new report in the project workspace.</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredReports.length)} of {filteredReports.length} reports
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium ${
                        currentPage === pageNum
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;
