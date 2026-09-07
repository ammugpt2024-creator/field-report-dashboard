import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  FlaskConical,
  Download,
  Eye,
  Trash2
} from 'lucide-react';
import {
  CYLINDER_BREAK_STATUS,
  deleteCylinderBreak,
  formatCylinderBreakStatus,
  getCylinderBreaks
} from '../services/labCylinderService';
import { openCylinderBreakPdf } from '../services/cylinderBreakPdfService';
import LabReportCatalog from '../components/lab/LabReportCatalog';

function statusColor(status) {
  switch (status) {
    case CYLINDER_BREAK_STATUS.APPROVED:
      return 'bg-green-100 text-green-800';
    case CYLINDER_BREAK_STATUS.SUBMITTED:
      return 'bg-blue-100 text-blue-800';
    case CYLINDER_BREAK_STATUS.RETURNED:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

// Summarise pass/fail across the cylinders that already have a break result.
function resultSummary(report) {
  const withResult = (report.breaks || []).filter((b) => b.result);
  if (!withResult.length) return '—';
  const pass = withResult.filter((b) => String(b.result).toUpperCase() === 'PASS').length;
  return `${pass}/${withResult.length} PASS`;
}

function reportDate(report) {
  const value = report.updatedAt || report.createdAt;
  return value ? new Date(value).toLocaleDateString() : '—';
}

function LabReports() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [allReports, setAllReports] = useState(() => getCylinderBreaks());

  // Only show records that belong to this project, newest first.
  const reports = useMemo(
    () =>
      allReports
        .filter((report) => String(report.projectId) === String(projectId))
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    [allReports, projectId]
  );

  function openReport(report) {
    navigate(`/lab-reports/${report.id}/edit`);
  }

  function removeReport(report) {
    if (!window.confirm('Delete this lab intelligence record?')) return;
    deleteCylinderBreak(report.id);
    setAllReports(getCylinderBreaks());
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-slate-300" />
              </button>
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-bold tracking-tight text-white">Lab Intelligence</h1>
                <p className="text-slate-300 text-sm mt-1">Manage laboratory verification records and compliance documentation.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Create a new lab record — shared catalog so this matches the
            technician Lab Reports view. Only Cylinder Break is available today. */}
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-gray-900">Create a lab record</h2>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-md sm:p-6">
            <LabReportCatalog
              navigate={navigate}
              resolveRoute={(key) => (key === 'cylinder-break' ? `/project/${projectId}/lab-reports/create` : null)}
            />
          </div>
        </div>

        <h2 className="mb-3 text-lg font-bold text-gray-900">Records</h2>
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          {reports.length > 0 ? (
            <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Report #</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Set / Project</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cylinders</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Result</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tested By</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => openReport(report)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{report.reportNumber}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{reportDate(report)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <FlaskConical className="w-5 h-5 text-gray-400" />
                          <span className="min-w-0">
                            <span className="block font-medium">Set {report.setNumber || '—'}</span>
                            <span className="block truncate text-xs text-gray-500">{report.projectName || 'No project linked'}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{(report.breaks || []).length}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 text-sm">{resultSummary(report)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusColor(report.status)}`}>
                          {formatCylinderBreakStatus(report.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.technicianName || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openReport(report)}
                            className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                            title="Open record"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openCylinderBreakPdf(report)}
                            className="p-2 hover:bg-green-50 rounded-lg transition-colors text-green-600"
                            title="Export PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeReport(report)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                            title="Delete record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-4 p-4 lg:hidden">
              {reports.map((report) => (
                <article
                  key={report.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openReport(report)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openReport(report); }}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-gray-900">{report.reportNumber}</h3>
                      <p className="mt-1 text-sm font-semibold text-gray-600">{reportDate(report)}</p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${statusColor(report.status)}`}>
                      {formatCylinderBreakStatus(report.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Set / Project</p>
                      <p className="mt-1 font-semibold text-gray-800">Set {report.setNumber || '—'}</p>
                      <p className="truncate text-xs text-gray-500">{report.projectName || 'No project linked'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cylinders</p>
                      <p className="mt-1 font-semibold text-gray-800">{(report.breaks || []).length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Result</p>
                      <p className="mt-1 font-semibold text-gray-800">{resultSummary(report)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Tested By</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.technicianName || '—'}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openReport(report)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-2 font-semibold text-blue-700">
                      <Eye className="h-4 w-4" />
                      Open
                    </button>
                    <button onClick={() => openCylinderBreakPdf(report)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-2 font-semibold text-green-700">
                      <Download className="h-4 w-4" />
                      PDF
                    </button>
                    <button onClick={() => removeReport(report)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2 font-semibold text-red-700">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <FlaskConical className="h-6 w-6" />
              </span>
              <p className="mt-3 text-gray-600">No lab intelligence records yet.</p>
              <p className="mt-1 text-sm text-gray-500">Use “Create a lab record” above to start one.</p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        {reports.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            Showing <span className="font-semibold">{reports.length}</span> lab intelligence record{reports.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

export default LabReports;
