import KeyValueList from "../mobile/KeyValueList";

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

// Desktop table column headers (A–L match TL-125A form rows)
const BASE_COLUMNS = [
  { key: "testNo",               label: "Test #" },
  { key: "location",             label: "Location" },
  { key: "moldAndSoilWeight",    label: "A: Mold+Soil (lb)" },
  { key: "moldWeight",           label: "B: Mold Wt (lb)" },
  { key: "wetDensity",           label: "D: Wet Density (lb/ft³)" },
  { key: "moistureContent",      label: "F: Moisture (%)" },
  { key: "selectedCurve",        label: "Curve" },
  { key: "maxDryDensityFromCurve",   label: "G: MDD (lb/ft³)" },
  { key: "optimumMoistureFromCurve", label: "H: OMC (%)" },
  { key: "fieldDryDensity",      label: "I: Field Density (lb/ft³)" },
  { key: "percentCompaction",    label: "L: % Compaction" },
  { key: "compactionResult",     label: "Result" },
];

const OVERSIZED_COLUMNS = [
  { key: "percentPlusNo4",         label: "J: No.4 (%)" },
  { key: "correctedMaxDryDensity", label: "K: Corr MDD (lb/ft³)" },
];

export default function ProctorReportInlineContent({ report, reportLabel = "Report" }) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  const pdfUrl = report.pdfUrl || report.pdf_url || report.finalPdfUrl || report.final_pdf_url || "";
  const hasOversized = records.some((r) => r.hasOversizedCorrection);
  const columns = hasOversized ? [...BASE_COLUMNS, ...OVERSIZED_COLUMNS] : BASE_COLUMNS;

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">One-Point Proctor Report · VTM-12 / TL-125A</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {report.reportNumber || "OPP Report"}</h4>
          </div>
          {pdfUrl && (
            <div className="flex gap-2">
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-xl bg-slate-950 px-3 text-xs font-bold text-white">View PDF</a>
              <a href={pdfUrl} download className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">Download PDF</a>
            </div>
          )}
        </div>
      </section>

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Report Header</h5>
        <KeyValueList className="mt-2" columns={3} items={[
          ["Project Name", valueOrDash(report.projectName || report.project_name)],
          ["Project Number", valueOrDash(report.projectNumber || report.project_number)],
          ["Date", valueOrDash(report.date)],
          ["Client", valueOrDash(report.client)],
          ["Test Standard", "AASHTO T 272 / VTM-12"],
          ["Curve Set", "Set \"C\" (A–Z)"]
        ]} />
      </section>

      {records.length > 0 && (
        <section className="report-section keep-together">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h5 className="text-sm font-bold text-slate-950">Test Records (TL-125A rows A–L)</h5>
            <span className="text-xs font-bold text-slate-500">{records.length} record{records.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Mobile stacked cards */}
          <dl className="mt-3 space-y-2 md:hidden">
            {records.map((record, index) => {
              const pct = String(record.percentCompaction || "").trim();
              const result = String(record.compactionResult || "").trim();
              return (
                <div key={record.id || index} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-bold text-slate-950">Test #{valueOrDash(record.testNo || index + 1)}</p>
                  <KeyValueList className="mt-1" columns={1} items={[
                    ["Location", valueOrDash(record.location)],
                    ["Material Description", valueOrDash(record.materialDescription)],
                    ["A · Mold + Soil Weight (lb)", valueOrDash(record.moldAndSoilWeight)],
                    ["B · Mold Weight (lb)", valueOrDash(record.moldWeight)],
                    ["C · Wet Soil Weight (lb)", valueOrDash(record.wetSoilWeight)],
                    ["D · Wet Density (lb/ft³)", valueOrDash(record.wetDensity)],
                    ...(record.speedyDialReading ? [["E · Speedy Dial Reading", valueOrDash(record.speedyDialReading)]] : []),
                    ["F · Moisture Content (%)", valueOrDash(record.moistureContent)],
                    ["Curve (Fig. 1)", valueOrDash(record.selectedCurve)],
                    ["G · Max Dry Density (lb/ft³)", valueOrDash(record.maxDryDensityFromCurve)],
                    ["H · Optimum Moisture (%)", valueOrDash(record.optimumMoistureFromCurve)],
                    ["I · Field Dry Density (lb/ft³)", valueOrDash(record.fieldDryDensity)],
                    ...(record.hasOversizedCorrection ? [
                      ["J · % Retained No. 4", valueOrDash(record.percentPlusNo4)],
                      ["K · Corrected Max Dry Density (lb/ft³)", valueOrDash(record.correctedMaxDryDensity)],
                      ["Corrected OMC (%)", valueOrDash(record.correctedOptimumMoisture)]
                    ] : []),
                    ["L · % Compaction", pct ? `${pct}%` : "-"],
                    ["Required Compaction (%)", valueOrDash(record.requiredCompaction)]
                  ]} />
                  {result && (
                    <div className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${result === "PASS" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
                      Result: {result}
                    </div>
                  )}
                </div>
              );
            })}
          </dl>

          {/* Desktop table */}
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead className="bg-slate-950 text-white">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="border-r border-slate-800 px-2 py-2 font-bold last:border-r-0 whitespace-nowrap">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const pct = String(record.percentCompaction || "").trim();
                  const result = String(record.compactionResult || "").trim();
                  const isPass = result === "PASS";
                  const isFail = result === "FAIL";
                  return (
                    <tr key={record.id || index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.testNo || index + 1)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.location)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.moldAndSoilWeight)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.moldWeight)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.wetDensity)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.moistureContent)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-bold text-blue-800">{valueOrDash(record.selectedCurve)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.maxDryDensityFromCurve)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2">{valueOrDash(record.optimumMoistureFromCurve)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.fieldDryDensity)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-bold">{pct ? `${pct}%` : "-"}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 font-bold ${isPass ? "text-emerald-800" : isFail ? "text-rose-700" : "text-slate-400"}`}>
                        {result || "-"}
                      </td>
                      {hasOversized && (
                        <>
                          <td className="border-r border-t border-slate-200 px-2 py-2 text-amber-800">{valueOrDash(record.percentPlusNo4)}</td>
                          <td className="border-t border-slate-200 px-2 py-2 font-semibold text-amber-800">{valueOrDash(record.correctedMaxDryDensity)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Calculation Notes</h5>
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-6 text-emerald-900">
          <p>C = A − B · D = C × 30 (wet density) · L = I / G × 100 (% compaction)</p>
          <p className="mt-1 text-slate-600">G from VTM-12 Figure 1 curve · K (corrected MDD) applied when J ≥ 10% retained on No. 4 · Standard: AASHTO T 272 / VTM-12 / TL-125A</p>
        </div>
      </section>
    </div>
  );
}
