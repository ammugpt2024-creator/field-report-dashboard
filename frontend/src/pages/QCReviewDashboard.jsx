import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Filter,
  Search,
  TimerReset,
  XCircle
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { isQcRole, ROLES } from '../utils/permissions';
import { isUnscoped, meetsLevel } from '../utils/moduleAccess';
import StatusBadge from '../components/StatusBadge';
import ReportActions from '../components/ReportActions';
import {
  ACTION_IDS,
  REPORT_STATUS,
  normalizeReportStatus
} from '../workflow/workflowEngine';
import { MODULE_NAMES } from '../config/branding';

const QUEUE_STATUSES = [
  REPORT_STATUS.SUBMITTED_FOR_QC,
  REPORT_STATUS.UNDER_REVIEW,
  REPORT_STATUS.RESUBMITTED,
  REPORT_STATUS.APPROVED,
  REPORT_STATUS.FINALIZED,
  REPORT_STATUS.REJECTED,
  REPORT_STATUS.REVISION_REQUIRED
];

const REVIEWABLE_STATUSES = [
  REPORT_STATUS.SUBMITTED_FOR_QC,
  REPORT_STATUS.RESUBMITTED,
  REPORT_STATUS.UNDER_REVIEW
];

const FILTERS = [
  { key: 'pending', label: 'Under Validation' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'revision_required', label: 'Requires Action' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All' }
];

function hoursBetween(start, end = new Date()) {
  if (!start) return 0;
  const started = new Date(start);
  if (Number.isNaN(started.getTime())) return 0;
  return Math.max(0, (end.getTime() - started.getTime()) / 36e5);
}

function formatAging(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
}

function agingTone(hours) {
  if (hours >= 12) return 'border-rose-200 bg-rose-50 text-rose-800';
  if (hours >= 4) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function normalizeDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function getPriority(report, agingHours) {
  if (report.priority) return String(report.priority).toUpperCase();
  if (agingHours >= 12) return 'HIGH';
  if (agingHours >= 4) return 'MEDIUM';
  return 'NORMAL';
}

function isClosedStatus(status) {
  return [
    REPORT_STATUS.APPROVED,
    REPORT_STATUS.FINALIZED,
    REPORT_STATUS.REJECTED,
    REPORT_STATUS.REVISION_REQUIRED
  ].includes(status);
}

function priorityRank(priority) {
  return { HIGH: 3, MEDIUM: 2, NORMAL: 1, LOW: 0 }[String(priority || '').toUpperCase()] ?? 1;
}

function getSubmittedAt(report) {
  return report.submitted_at || report.updated_at || report.created_at;
}

function QCReviewDashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role, session, profile, companyRole, isPlatformAdmin, modulePermissions } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const normalizedRole = String(role || '').toLowerCase();
  const isManagerView = [ROLES.QC_MANAGER, ROLES.ADMIN, 'project_manager', 'manager'].includes(normalizedRole);
  const canViewQueue = isQcRole(role) || isManagerView;

  useEffect(() => {
    const requestedStatus = searchParams.get('status');
    if (requestedStatus && FILTERS.some((filter) => filter.key === requestedStatus)) {
      setStatusFilter(requestedStatus);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        let query = supabase
          .from('concrete_test_logs')
          .select('*')
          .in('status', QUEUE_STATUSES);

        if (projectId) {
          query = query.eq('project_id', Number(projectId));
        }

        // Fetch the company's queue; visibility is scoped client-side by the
        // admin-set access level (see matchesAccess), not by role.

        const { data, error: fetchError } = await query.order('submitted_at', { ascending: true, nullsFirst: false });
        if (fetchError) throw fetchError;
        setReports(data || []);
      } catch (err) {
        console.error('Review queue failed', err);
        setError(err.message || 'Unable to load the review queue.');
      } finally {
        setLoading(false);
      }
    }

    if (canViewQueue) {
      loadReports();
    } else {
      setLoading(false);
      setError('You are not authorized to view the review queue.');
    }
  }, [canViewQueue, isManagerView, projectId, role, session?.user?.id]);

  const enrichedReports = useMemo(() => {
    return reports
      .map((report) => {
        const normalizedStatus = normalizeReportStatus(report.status);
        const submittedAt = getSubmittedAt(report);
        const completedAt = report.approved_at || report.rejected_at || report.reviewed_at || report.updated_at;
        const closed = isClosedStatus(normalizedStatus);
        const agingHours = closed ? hoursBetween(submittedAt, new Date(completedAt)) : hoursBetween(submittedAt);
        const priority = closed ? String(report.priority || 'NORMAL').toUpperCase() : getPriority(report, agingHours);
        const overdue = !closed && REVIEWABLE_STATUSES.includes(normalizedStatus) && agingHours >= 12;

        return {
          ...report,
          normalizedStatus,
          submittedAt,
          completedAt,
          closed,
          agingHours,
          priority,
          overdue
        };
      })
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (REVIEWABLE_STATUSES.includes(a.normalizedStatus) && REVIEWABLE_STATUSES.includes(b.normalizedStatus)) {
          const submittedDiff = new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime();
          if (submittedDiff !== 0) return submittedDiff;
        }
        return priorityRank(b.priority) - priorityRank(a.priority);
      });
  }, [reports]);

  const kpis = useMemo(() => {
    const approvedReports = enrichedReports.filter((report) =>
      [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(report.normalizedStatus)
    );
    const revisionRequiredReports = enrichedReports.filter((report) =>
      report.normalizedStatus === REPORT_STATUS.REVISION_REQUIRED
    );
    const rejectedReports = enrichedReports.filter((report) =>
      report.normalizedStatus === REPORT_STATUS.REJECTED
    );
    const completedReviews = enrichedReports.filter((report) => report.submitted_at && (report.approved_at || report.rejected_at));
    const avgHours = completedReviews.length
      ? completedReviews.reduce((total, report) => total + hoursBetween(report.submitted_at, new Date(report.approved_at || report.rejected_at)), 0) / completedReviews.length
      : 0;

    return [
      {
        label: 'Under Validation',
        value: enrichedReports.filter((report) => [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus)).length,
        icon: Bell,
        tone: 'bg-blue-50 text-blue-900'
      },
      {
        label: 'Under Review',
        value: enrichedReports.filter((report) => report.normalizedStatus === REPORT_STATUS.UNDER_REVIEW).length,
        icon: Clock,
        tone: 'bg-amber-50 text-amber-900'
      },
      {
        label: 'Overdue Validations',
        value: enrichedReports.filter((report) => report.overdue).length,
        icon: AlertTriangle,
        tone: 'bg-rose-50 text-rose-900'
      },
      {
        label: 'Approved',
        value: approvedReports.length,
        icon: CheckCircle,
        tone: 'bg-emerald-50 text-emerald-900'
      },
      {
        label: 'Requires Action',
        value: revisionRequiredReports.length,
        icon: TimerReset,
        tone: 'bg-amber-50 text-amber-900'
      },
      {
        label: 'Rejected',
        value: rejectedReports.length,
        icon: XCircle,
        tone: 'bg-rose-50 text-rose-900'
      },
      {
        label: 'Avg Validation Time',
        value: avgHours ? formatAging(avgHours) : '—',
        icon: TimerReset,
        tone: 'bg-indigo-50 text-indigo-900'
      }
    ];
  }, [enrichedReports]);

  const projects = useMemo(() => {
    return Array.from(new Set(enrichedReports.map((report) => report.project_name || report.project_number).filter(Boolean))).sort();
  }, [enrichedReports]);

  const technicians = useMemo(() => {
    return Array.from(new Set(enrichedReports.map((report) => report.submitted_by_name || report.technician_name || report.data_logger).filter(Boolean))).sort();
  }, [enrichedReports]);

  const filteredReports = enrichedReports.filter((report) => {
    const term = search.trim().toLowerCase();
    const technician = report.submitted_by_name || report.technician_name || report.data_logger || '';
    const project = report.project_name || report.project_number || '';
    const submittedDate = normalizeDate(report.submittedAt);

    const matchesText = !term || [report.dfr_number, project, technician, report.status, report.priority]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'pending' && [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus)) ||
      (statusFilter === 'under_review' && report.normalizedStatus === REPORT_STATUS.UNDER_REVIEW) ||
      (statusFilter === 'approved' && [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(report.normalizedStatus)) ||
      (statusFilter === 'revision_required' && report.normalizedStatus === REPORT_STATUS.REVISION_REQUIRED) ||
      (statusFilter === 'rejected' && report.normalizedStatus === REPORT_STATUS.REJECTED) ||
      (statusFilter === 'overdue' && report.overdue);

    const matchesProject = projectFilter === 'all' || project === projectFilter;
    const matchesTechnician = technicianFilter === 'all' || technician === technicianFilter;
    const matchesDateFrom = !dateFrom || submittedDate >= dateFrom;
    const matchesDateTo = !dateTo || submittedDate <= dateTo;

    // Visibility by the admin-set access level: approve+ on this project's Field
    // Test Reports = oversight (see all); otherwise only reports routed to me or
    // that I submitted.
    const mine = session?.user?.id;
    const matchesAccess =
      isUnscoped(companyRole, isPlatformAdmin) ||
      meetsLevel(modulePermissions?.[String(report.project_id)]?.field_test_reports, 'approve') ||
      report.qc_assigned_to === mine ||
      report.submitted_by === mine ||
      report.created_by === mine;

    return matchesAccess && matchesText && matchesStatus && matchesProject && matchesTechnician && matchesDateFrom && matchesDateTo;
  });

  const notifications = enrichedReports
    .filter((report) => report.overdue || [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus))
    .slice(0, 4);

  const getQueueActions = (report) => {
    if (REVIEWABLE_STATUSES.includes(report.normalizedStatus)) {
      return [
        ACTION_IDS.REVIEW,
        ACTION_IDS.PDF_SUBMITTED,
        ACTION_IDS.APPROVE,
        ACTION_IDS.REQUEST_REVISION,
        ACTION_IDS.REJECT
      ];
    }
    if ([REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(report.normalizedStatus)) {
      return [ACTION_IDS.OPEN_REPORT, ACTION_IDS.DOWNLOAD_FINAL];
    }
    return [ACTION_IDS.OPEN_REPORT, ACTION_IDS.PDF_SUBMITTED];
  };

  const handleReportAction = (actionId, report) => {
    const reportProjectId = report.project_id || projectId || 1;
    const viewRoute = `/project/${reportProjectId}/field-reports/concrete-test-log/${report.id}`;
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
        break;
    }
  };

  const renderQueueActions = (report, isMobile = false) => (
    <ReportActions
      role={role}
      status={report.status}
      pdfUrl={report.final_pdf_url || report.pdf_url}
      onAction={(id) => handleReportAction(id, report)}
      allowedActions={getQueueActions(report)}
      isMobile={isMobile}
    />
  );

  const defaultProjectId = projectId || enrichedReports.find((report) => report.project_id)?.project_id || 1;

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Validation Inbox</h1>
            <p className="mt-0.5 max-w-3xl text-[13px] font-medium text-slate-500">
              Records assigned to {profile?.full_name || profile?.email || 'the validation team'}, sorted by SLA risk and oldest submissions first.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
            <div className="inline-flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 xl:w-64">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search DFR, project, engineer"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('pending');
                setSearch('');
                setProjectFilter('all');
                setTechnicianFilter('all');
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Filter className="h-4 w-4" /> Reset
            </button>
            <button
              type="button"
              onClick={() => navigate(`/project/${defaultProjectId}`)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {MODULE_NAMES.projectHub}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/project/${defaultProjectId}/field-reports/concrete-test-log/create`)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              New Record
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800 shadow-sm">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {kpis.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`rounded-3xl p-5 shadow-sm ${tone}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">{label}</p>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-[150px_minmax(180px,1fr)_minmax(160px,1fr)_160px_160px]">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                {FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>{filter.label}</option>
                ))}
              </select>
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <option value="all">All Project Operations</option>
                {projects.map((project) => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              <select
                value={technicianFilter}
                onChange={(event) => setTechnicianFilter(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <option value="all">All Field Engineers</option>
                {technicians.map((technician) => (
                  <option key={technician} value={technician}>{technician}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                aria-label="Submitted from"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                aria-label="Submitted to"
              />
            </div>

            <div className="mt-6 hidden lg:block">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[14%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[13%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">DFR #</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Field Engineer</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">SLA</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-10 text-slate-500" colSpan={8}>Loading review queue...</td>
                    </tr>
                  ) : filteredReports.length > 0 ? (
                    filteredReports.map((report) => (
                      <tr key={report.id} className={report.overdue ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                        <td className="break-words px-4 py-4 font-bold text-slate-950">{report.dfr_number || '—'}</td>
                        <td className="break-words px-4 py-4 text-slate-700">{report.project_name || report.project_number || '—'}</td>
                        <td className="break-words px-4 py-4 text-slate-700">{report.submitted_by_name || report.technician_name || report.data_logger || '—'}</td>
                        <td className="px-4 py-4 text-slate-700">{report.submittedAt ? new Date(report.submittedAt).toLocaleString() : '—'}</td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{report.priority}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${report.closed ? 'border-slate-200 bg-slate-50 text-slate-700' : agingTone(report.agingHours)}`}>
                            {formatAging(report.agingHours)}
                          </span>
                        </td>
                        <td className="px-4 py-4"><StatusBadge status={report.status} /></td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end">{renderQueueActions(report)}</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-10 text-slate-500" colSpan={8}>No reports match the current queue filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-4 lg:hidden">
              {loading ? (
                <p className="rounded-3xl bg-slate-50 p-8 text-center font-semibold text-slate-500">Loading review queue...</p>
              ) : filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <article key={report.id} className={`rounded-3xl border p-5 shadow-sm ${report.overdue ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-lg font-bold text-slate-950">{report.dfr_number || 'No DFR #'}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{report.project_name || report.project_number || '—'}</p>
                      </div>
                      <StatusBadge status={report.status} />
                    </div>
                    <div className="my-4 grid grid-cols-1 gap-3 rounded-2xl bg-white/70 p-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Field Engineer</p>
                        <p className="mt-1 font-semibold text-slate-800">{report.submitted_by_name || report.technician_name || report.data_logger || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Submitted</p>
                        <p className="mt-1 font-semibold text-slate-800">{report.submittedAt ? new Date(report.submittedAt).toLocaleString() : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Priority</p>
                        <p className="mt-1 font-semibold text-slate-800">{report.priority}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{report.closed ? 'Review Time' : 'SLA Aging'}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${report.closed ? 'border-slate-200 bg-slate-50 text-slate-700' : agingTone(report.agingHours)}`}>
                          {formatAging(report.agingHours)}
                        </span>
                      </div>
                    </div>
                    {renderQueueActions(report, true)}
                  </article>
                ))
              ) : (
                <p className="rounded-3xl bg-slate-50 p-8 text-center font-semibold text-slate-500">No reports match the current queue filters.</p>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Notification Center</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Queue Signals</h2>
              </div>
              <Bell className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-5 space-y-3">
              {notifications.length > 0 ? (
                notifications.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => navigate(`/qc/review/${report.id}`)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:shadow-sm ${report.overdue ? 'border-rose-200 bg-rose-50' : 'border-blue-100 bg-blue-50'}`}
                  >
                    <p className="text-sm font-bold text-slate-950">{report.overdue ? 'Overdue validation' : 'New submission'}</p>
                    <p className="mt-1 break-words text-sm text-slate-700">{report.dfr_number || 'No DFR #'} · {formatAging(report.agingHours)}</p>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No active alerts.</p>
              )}
            </div>

            {isManagerView && (
              <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Manager Oversight</p>
                <p className="mt-2 text-sm text-slate-200">
                  This queue is showing all quality reviewer workloads, overdue items, and bottlenecks across project operations.
                </p>
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

export default QCReviewDashboard;
