import { FileText, Plus } from "lucide-react";

export default function ActivityReportSelector({ onAddConcreteReport, disabled = false }) {
  const reportTypes = [
    { label: "Concrete Report", description: "Create concrete testing documentation.", available: true },
    { label: "Inspection Report", description: "Coming soon", available: false },
    { label: "Density Report", description: "Coming soon", available: false },
    { label: "Nuclear Gauge Report", description: "Coming soon", available: false },
    { label: "Asphalt Report", description: "Coming soon", available: false },
    { label: "Other", description: "Coming soon", available: false }
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
        <FileText className="h-4 w-4 text-blue-700" />
        Select Report Type
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-500">Select a report type to attach to this activity.</p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {reportTypes.map((reportType) => (
          <button
            key={reportType.label}
            type="button"
            onClick={reportType.available ? onAddConcreteReport : undefined}
            disabled={disabled || !reportType.available}
            className={`min-h-16 rounded-2xl border px-4 py-3 text-left transition ${
              reportType.available
                ? "border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100"
                : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <span className="flex items-center justify-between gap-3 text-sm font-bold">
              {reportType.label}
              {reportType.available ? <Plus className="h-4 w-4" /> : <span className="text-xs uppercase tracking-[0.16em]">Soon</span>}
            </span>
            <span className="mt-1 block text-xs font-semibold">{reportType.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
