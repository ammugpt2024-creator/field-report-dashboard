import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Search, Calendar, FileText, Eye, Download, Inbox } from 'lucide-react';

function Reports() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);

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

        setReports(
          reportRows.map((report) => ({
            ...report,
            dfr_number: report.dfr_number || specificationsByLogId[report.id]?.dfr_number || ''
          }))
        );
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

  const normalizeStatus = (status) => String(status || '').toUpperCase();

  const getReportStatusLabel = (status) => {
    switch (normalizeStatus(status)) {
      case 'DRAFT':
        return 'Draft';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'SUBMITTED_FOR_REVIEW':
        return 'Submitted for QA Review';
      case 'UNDER_QA_REVIEW':
        return 'Under QA Review';
      case 'APPROVED':
      case 'FINALIZED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'PENDING_QC_APPROVAL':
        return 'Pending QC';
      default:
        return String(status || 'Draft')
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const statusBadgeClass = (status) => {
    const normalized = normalizeStatus(status);
    const base = 'inline-flex rounded-full px-3 py-1 text-xs font-semibold';
    switch (normalized) {
      case 'APPROVED':
      case 'FINALIZED':
        return `${base} bg-emerald-100 text-emerald-800`;
      case 'SUBMITTED_FOR_REVIEW':
      case 'UNDER_QA_REVIEW':
      case 'PENDING_QC_APPROVAL':
        return `${base} bg-sky-100 text-sky-800`;
      case 'DRAFT':
      case 'IN_PROGRESS':
        return `${base} bg-amber-100 text-amber-800`;
      case 'REJECTED':
        return `${base} bg-rose-100 text-rose-800`;
      default:
        return `${base} bg-slate-100 text-slate-700`;
    }
  };

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

  const uniqueTechnicians = Array.from(
    new Set(reports.map((report) => report.data_logger).filter(Boolean))
  );

  const getReportPdfUrl = (report) => report.final_pdf_url || report.pdf_url || '';

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-[1400px] space-y-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">QC Management Platform</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">Report Dashboard</h1>
              <p className="mt-2 text-slate-600">Search, filter and review final concrete test logs with status badges and PDF actions.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Total Reports</p>
                <p className="mt-2 text-2xl font-semibold">{reports.length}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Pending QC</p>
                <p className="mt-2 text-2xl font-semibold">
                  {reports.filter((r) => {
                    const status = normalizeStatus(r.status);
                    return status === 'SUBMITTED_FOR_REVIEW' || status === 'UNDER_QA_REVIEW' || status === 'PENDING_QC_APPROVAL';
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

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Search</span>
              <div className="mt-2 relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search DFR, project or technician"
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
                <option value="in_progress">In Progress</option>
                <option value="submitted_for_review">Submitted for QA Review</option>
                <option value="under_qa_review">Under QA Review</option>
                <option value="pending_qc_approval">Pending QC</option>
                <option value="approved">Approved</option>
                <option value="finalized">Finalized</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Technician</span>
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

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">DFR #</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Technician</th>
                  <th className="px-4 py-3 font-semibold">Sample Date</th>
                  <th className="px-4 py-3 font-semibold">Generated</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">PDF</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-900">{report.dfr_number || 'N/A'}</td>
                    <td className="px-4 py-4">{report.project_name || 'Unknown project'}</td>
                    <td className="px-4 py-4">{report.data_logger || 'Unassigned'}</td>
                    <td className="px-4 py-4">{report.date_sampled || '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{formatTimestamp(report.created_at)}</td>
                    <td className="px-4 py-4"><span className={statusBadgeClass(report.status)}>{getReportStatusLabel(report.status)}</span></td>
                    <td className="px-4 py-4">
                      {getReportPdfUrl(report) ? (
                        <a
                          href={getReportPdfUrl(report)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          <FileText className="h-3.5 w-3.5" /> View PDF
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => navigate(`/project/${projectId}/field-reports/concrete-test-log/${report.id}`)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        {getReportPdfUrl(report) && (
                          <a
                            href={getReportPdfUrl(report)}
                            download
                            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && filteredReports.length === 0 && (
            <div className="mt-12 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              <Inbox className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-lg font-semibold">No matching reports found</p>
              <p className="mt-2 text-sm">Try clearing filters or creating a new report in the project workspace.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;
