import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, Search, Clock, CheckCircle, XCircle, Eye } from 'lucide-react';
import { isQcRole } from '../utils/permissions';
import StatusBadge from '../components/StatusBadge';
import ReportActions from '../components/ReportActions';
import {
  REPORT_STATUS,
  normalizeReportStatus,
  ACTION_IDS
} from '../workflow/workflowEngine';

const QUEUE_STATUSES = [
  REPORT_STATUS.SUBMITTED_FOR_QC,
  REPORT_STATUS.UNDER_REVIEW,
  REPORT_STATUS.RESUBMITTED,
  REPORT_STATUS.APPROVED,
  REPORT_STATUS.FINALIZED,
  REPORT_STATUS.REJECTED,
  REPORT_STATUS.REVISION_REQUIRED
];

function QCReviewDashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('concrete_test_logs')
          .select('*')
          .eq('project_id', Number(projectId))
          .in('status', QUEUE_STATUSES)
          .order('updated_at', { ascending: false });

        if (fetchError) throw fetchError;
        setReports(data || []);
      } catch (err) {
        console.error('QC review dashboard failed', err);
        setError(err.message || 'Unable to load QC review queue.');
      } finally {
        setLoading(false);
      }
    }

    if (isQcRole(role)) {
      loadReports();
    } else {
      setLoading(false);
      setError('You are not authorized to view the QC review dashboard.');
    }
  }, [projectId, role]);

  const filteredReports = reports.filter((report) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [report.project_name, report.project_number, report.dfr_number, report.status]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term));
  });

  const tabReports = reports.filter((report) => {
    const status = normalizeReportStatus(report.status);
    if (activeTab === 'pending') {
      return [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(status);
    } else if (activeTab === 'under_review') {
      return status === REPORT_STATUS.UNDER_REVIEW;
    } else if (activeTab === 'approved') {
      return [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(status);
    } else if (activeTab === 'rejected') {
      return [REPORT_STATUS.REJECTED, REPORT_STATUS.REVISION_REQUIRED].includes(status);
    } else if (activeTab === 'aging') {
      const submittedAt = new Date(report.submitted_at || report.updated_at || report.created_at);
      return [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED, REPORT_STATUS.UNDER_REVIEW].includes(status) &&
        Date.now() - submittedAt.getTime() > 24 * 60 * 60 * 1000;
    }
    return true;
  });

  const filteredTabReports = tabReports.filter((report) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [report.project_name, report.project_number, report.dfr_number, report.status]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term));
  });

  const pendingCount = reports.filter((r) => [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(normalizeReportStatus(r.status))).length;
  const underReviewCount = reports.filter((r) => normalizeReportStatus(r.status) === REPORT_STATUS.UNDER_REVIEW).length;
  const approvedTodayCount = reports.filter((r) => {
    const status = normalizeReportStatus(r.status);
    const approvedDate = r.approved_at ? new Date(r.approved_at).toDateString() : '';
    return [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(status) && approvedDate === new Date().toDateString();
  }).length;
  const rejectedCount = reports.filter((r) => [REPORT_STATUS.REJECTED, REPORT_STATUS.REVISION_REQUIRED].includes(normalizeReportStatus(r.status))).length;
  const agingCount = reports.filter((r) => {
    const status = normalizeReportStatus(r.status);
    const submittedAt = new Date(r.submitted_at || r.updated_at || r.created_at);
    return [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED, REPORT_STATUS.UNDER_REVIEW].includes(status) &&
      Date.now() - submittedAt.getTime() > 24 * 60 * 60 * 1000;
  }).length;

  const getQueueActions = (report) => {
    const reportStatus = normalizeReportStatus(report.status);
    if ([REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED, REPORT_STATUS.UNDER_REVIEW].includes(reportStatus)) {
      return [ACTION_IDS.REVIEW];
    }
    return [ACTION_IDS.OPEN_REPORT];
  };

  const handleReportAction = (actionId, report) => {
    const viewRoute = `/project/${projectId}/field-reports/concrete-test-log/${report.id}`;
    const reviewRoute = `/qc/review/${report.id}`;

    switch (actionId) {
      case ACTION_IDS.REVIEW:
      case ACTION_IDS.APPROVE:
      case ACTION_IDS.REQUEST_REVISION:
      case ACTION_IDS.REJECT:
        navigate(reviewRoute);
        break;
      case ACTION_IDS.OPEN_REPORT:
        navigate(viewRoute);
        break;
      default:
        console.log('Action not handled in dashboard:', actionId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button
                onClick={() => navigate(-1)}
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                <ChevronLeft className="w-5 h-5" /> Back
              </button>
              <h1 className="text-3xl font-semibold text-slate-950">QC Review Dashboard</h1>
              <p className="mt-2 text-sm text-slate-600">
                Review concrete log submissions, approve reports, and manage revisions.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                <Search className="h-4 w-4" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search DFR, project, status"
                  className="w-64 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl bg-rose-50 p-6 text-sm font-semibold text-rose-800 shadow-sm">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['pending', 'Pending Review', pendingCount, 'bg-amber-50 text-amber-900'],
            ['under_review', 'Under Review', underReviewCount, 'bg-sky-50 text-sky-900'],
            ['approved', 'Approved Today', approvedTodayCount, 'bg-emerald-50 text-emerald-900'],
            ['rejected', 'Rejected Reports', rejectedCount, 'bg-rose-50 text-rose-900'],
            ['aging', 'Aging Reports', agingCount, 'bg-slate-100 text-slate-900']
          ].map(([key, label, count, className]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-3xl border p-5 text-left shadow-sm transition ${
                activeTab === key ? 'border-slate-900 bg-white' : `border-transparent ${className}`
              }`}
            >
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-3 text-3xl font-semibold">{count}</p>
            </button>
          ))}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('pending')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Clock className="h-4 w-4" />
                Pending
                <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">
                  {pendingCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('under_review')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'under_review'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Eye className="h-4 w-4" />
                Under Review
                <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">
                  {underReviewCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CheckCircle className="h-4 w-4" />
                Approved
                <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">
                  {reports.filter((r) => [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(normalizeReportStatus(r.status))).length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('rejected')}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'rejected'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <XCircle className="h-4 w-4" />
                Rejected
                <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">
                  {rejectedCount}
                </span>
              </button>
            </div>
            <span className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {reports.length} total
            </span>
          </div>

          <div className="mt-6 hidden overflow-x-auto lg:block">
            <table className="min-w-full table-auto text-sm text-left">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3">DFR</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Sample Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right pr-12">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={6}>
                      Loading QC queue...
                    </td>
                  </tr>
                ) : filteredTabReports.length > 0 ? (
                  filteredTabReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-900">{report.dfr_number || '—'}</td>
                      <td className="px-4 py-4 text-slate-700">{report.project_name || report.project_number || '—'}</td>
                      <td className="px-4 py-4 text-slate-700">{report.date_sampled || '—'}</td>
                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          <ReportActions 
                            role={role}
                            status={report.status}
                            pdfUrl={report.final_pdf_url || report.pdf_url}
                            onAction={(id) => handleReportAction(id, report)}
                            allowedActions={getQueueActions(report)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={6}>
                      No {activeTab} reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-4 lg:hidden">
            {loading ? (
              <p className="p-8 text-center text-slate-500 font-medium">Loading QC queue...</p>
            ) : filteredTabReports.length > 0 ? (
              filteredTabReports.map((report) => (
                <div key={report.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{report.dfr_number || 'No DFR #'}</p>
                      <p className="text-sm text-slate-500 font-medium">{report.project_name || 'No Project Name'}</p>
                    </div>
                    <StatusBadge status={report.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-5 text-sm border-y border-slate-50 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sample Date</p>
                      <p className="mt-1 font-semibold text-slate-700">{report.date_sampled || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Updated</p>
                      <p className="mt-1 font-semibold text-slate-700">{new Date(report.updated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <ReportActions 
                    role={role}
                    status={report.status}
                    pdfUrl={report.final_pdf_url || report.pdf_url}
                    onAction={(id) => handleReportAction(id, report)}
                    isMobile={true}
                    allowedActions={getQueueActions(report)}
                  />
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-slate-500 font-medium">No {activeTab} reports found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QCReviewDashboard;
