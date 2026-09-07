import { useParams, useNavigate } from "react-router-dom";
import { ClipboardCheck, ChevronLeft } from "lucide-react";

export default function InspectionWorkflows() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-950">Inspection Workflows</h1>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Quality incidents, resolution tracking, safety audits, and asset verification
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Body */}
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-100 text-purple-500">
          <ClipboardCheck className="h-10 w-10" />
        </span>
        <h2 className="mt-6 text-3xl font-bold text-slate-950">Inspection Workflows</h2>
        <p className="mt-3 max-w-md text-sm font-semibold text-slate-500">
          Manage inspection workflows, quality incidents, resolution tracking, approvals, safety audits, and asset verification across all active projects.
        </p>
        <span className="mt-6 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-5 py-2 text-xs font-bold text-amber-700">
          Coming Soon
        </span>
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="mt-8 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Project Operations
        </button>
      </div>
    </div>
  );
}
