import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ExternalLink, Search } from 'lucide-react';

const REVIEW_STATUSES = ['SUBMITTED_FOR_REVIEW', 'UNDER_QA_REVIEW'];

function QCReviewDashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('concrete_test_logs')
          .select('id,project_name,project_number,dfr_number,date_sampled,status,updated_at')
          .eq('project_id', Number(projectId))
          .in('status', REVIEW_STATUSES)
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

    if (role === 'qc_approver' || role === 'admin') {
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

  function statusLabel(status) {
    if (!status) return 'Unknown';
    if (status === 'SUBMITTED_FOR_REVIEW') return 'Submitted for QA Review';
    if (status === 'UNDER_QA_REVIEW') return 'Under QA Review';
    if (status === 'REJECTED') return 'Rejected';
    return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

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
                Review concrete log submissions pending QC approval or revisions.
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

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Pending QC Reports</h2>
              <p className="text-sm text-slate-500">{filteredReports.length} reports in the queue.</p>
            </div>
            <span className="rounded-2xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
              {reports.length} total
            </span>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full table-auto text-sm text-left">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3">DFR</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Sample Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={6}>
                      Loading QC queue...
                    </td>
                  </tr>
                ) : filteredReports.length > 0 ? (
                  filteredReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-900">{report.dfr_number || '—'}</td>
                      <td className="px-4 py-4 text-slate-700">{report.project_name || report.project_number || '—'}</td>
                      <td className="px-4 py-4 text-slate-700">{report.date_sampled || '—'}</td>
                      <td className="px-4 py-4 text-slate-700">
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                          {statusLabel(report.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{new Date(report.updated_at).toLocaleString()}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => navigate(`/project/${projectId}/field-reports/concrete-test-log/${report.id}`)}
                          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={6}>
                      No QC reports match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QCReviewDashboard;
