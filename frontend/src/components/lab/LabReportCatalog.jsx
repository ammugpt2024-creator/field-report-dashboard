import { FlaskConical, HardHat, Layers3 } from "lucide-react";

/**
 * Catalog of lab report types grouped by material, shared by the technician Lab
 * Reports page and a project's Lab Intelligence page so the two stay in sync.
 *
 * Each report has a stable `key`. Whether a card is usable is decided entirely
 * by the caller via `resolveRoute(key)`
 * (technician lab list vs. a project's create route), which returns a path or
 * null. A report with no resolved route renders as a disabled "Coming soon" card.
 */
const LAB_SECTION_TONE = {
  amber: { chip: "bg-amber-50 text-amber-700" },
  slate: { chip: "bg-slate-100 text-slate-600" },
  blue: { chip: "bg-blue-50 text-blue-700" }
};

const LAB_REPORT_SECTIONS = [
  {
    key: "soil",
    title: "Soil",
    icon: Layers3,
    tone: "amber",
    reports: [
      { key: "proctor-standard", label: "Proctor — Standard", description: "Standard Proctor moisture-density (ASTM D698 / AASHTO T99)." },
      { key: "proctor-modified", label: "Proctor — Modified", description: "Modified Proctor moisture-density (ASTM D1557 / AASHTO T180 / VTM-1)." },
      { key: "sieve", label: "Sieve Analysis", description: "Washed particle size distribution / gradation (ASTM D422)." },
      { key: "atterberg", label: "Atterberg Limits", description: "Liquid limit, plastic limit, plasticity index (ASTM D4318)." },
      { key: "hydrometer", label: "Hydrometer Analysis", description: "Sieve + hydrometer particle size & USDA texture (ASTM D422)." },
      { key: "cbr", label: "CBR (California Bearing Ratio)", description: "Subgrade bearing ratio — soaked/unsoaked, single or 3-point (ASTM D1883 / AASHTO T 193)." }
    ]
  },
  {
    key: "asphalt",
    title: "Asphalt",
    icon: Layers3,
    tone: "slate",
    reports: [
      { key: "bulk-sg", label: "Bulk Specific Gravity", description: "Bulk specific gravity & density of compacted asphalt (AASHTO T-166 / ASTM D2726)." }
    ]
  },
  {
    key: "concrete",
    title: "Concrete",
    icon: HardHat,
    tone: "blue",
    reports: [
      { key: "cylinder-break", label: "Cylinder Break", description: "Compressive strength of concrete cylinders." },
      { key: "core-break", label: "Core Break", description: "Compressive strength of drilled cores (ASTM C42)." }
    ]
  },
  {
    key: "grout",
    title: "Grout",
    icon: HardHat,
    tone: "blue",
    reports: [
      { key: "grout-cube-break", label: "Cube Break", description: "Grout compressive strength of 2\"×2\" cubes (ASTM C109/C1107)." }
    ]
  }
];

function LabReportCatalog({ navigate, resolveRoute }) {
  return (
    <div className="space-y-6">
      {LAB_REPORT_SECTIONS.map(({ key, title, icon: Icon, tone, reports }) => (
        <div key={key}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${LAB_SECTION_TONE[tone].chip}`}>
              <Icon className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-slate-950">{title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{reports.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((reportType) => {
              const route = resolveRoute ? resolveRoute(reportType.key) : null;
              const enabled = Boolean(route);
              return (
                <button
                  key={reportType.key}
                  type="button"
                  onClick={enabled ? () => navigate(route) : undefined}
                  disabled={!enabled}
                  className={`flex h-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition ${
                    enabled
                      ? "cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm"
                      : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${enabled ? "bg-blue-50 text-blue-700 ring-blue-100" : "bg-white text-slate-400 ring-slate-200"}`}>
                      <FlaskConical className="h-4 w-4" />
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {enabled ? "Available" : "Coming soon"}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm font-bold ${enabled ? "text-slate-900" : "text-slate-700"}`}>{reportType.label}</p>
                  <p className="text-xs font-medium leading-5 text-slate-500">{reportType.description}</p>
                  {enabled && <span className="mt-1 text-sm font-bold text-blue-700" aria-hidden="true">Open →</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default LabReportCatalog;
