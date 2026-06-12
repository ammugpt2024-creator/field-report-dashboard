import KeyValueList from "../mobile/KeyValueList";
function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function calculateMoistureRange(report) {
  const correctedOptimum = Number(report.correctedOptimumMoisture || report.corrected_optimum_moisture || 0);
  if (!Number.isFinite(correctedOptimum) || correctedOptimum <= 0) return "-";
  if (String(report.materialType || report.material_type).toLowerCase() === "aggregate") {
    return `${(correctedOptimum - 2).toFixed(1)} - ${(correctedOptimum + 2).toFixed(1)}`;
  }
  return `${(correctedOptimum * 0.8).toFixed(1)} - ${(correctedOptimum * 1.2).toFixed(1)}`;
}

const RECORD_COLUMNS = [
  "Test #",
  "Location",
  "Dry Density %",
  "Result",
  "Status"
];

export default function CompactionReportInlineContent({ report, reportLabel = "Report" }) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  const pdfUrl = report.pdfUrl || report.pdf_url || report.finalPdfUrl || report.final_pdf_url || report.pdfPublicUrl || report.pdf_public_url || "";
  const hasSpecs = [
    report.maximumDryDensity || report.maximum_dry_density,
    report.percentOptimumMoisture || report.percent_optimum_moisture,
    report.percentPassingNo4 || report.percent_passing_no4,
    report.correctedMaximumDryDensity || report.corrected_maximum_dry_density,
    report.correctedOptimumMoisture || report.corrected_optimum_moisture,
    report.percentMinimumDensityRequired || report.percent_minimum_density_required
  ].some((value) => String(value || "").trim());

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Compaction Report Details</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {report.reportNumber || "Compaction Report"}</h4>
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
          ["Section", valueOrDash(report.section)],
          ["Date", valueOrDash(report.date)],
          ["Client", valueOrDash(report.client)],
          ["Test For", valueOrDash(report.testFor || report.test_for)]
        ]} />
      </section>

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Gauge & Material</h5>
        <KeyValueList className="mt-2" columns={3} items={[
          ["Serial Number", valueOrDash(report.serialNumber || report.serial_number)],
          ["Gauge Model", valueOrDash(report.gaugeModel || report.gauge_model)],
          ["Calibration Due", valueOrDash(report.calibrationDueDate || report.calibration_due_date)],
          ["Standardized", valueOrDash(report.standardizedGauge || report.standardized_gauge)],
          ["Material Type", valueOrDash(report.materialType || report.material_type)],
          ["Material Name", valueOrDash(report.materialName || report.material_name)],
          ["Standard Density", valueOrDash(report.standardDensity || report.standard_density)],
          ["Standard Moisture", valueOrDash(report.standardMoisture || report.standard_moisture)]
        ]} />
      </section>

      {hasSpecs && <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Specifications</h5>
        <KeyValueList className="mt-2" columns={3} items={[
          ["Maximum Dry Density", valueOrDash(report.maximumDryDensity || report.maximum_dry_density)],
          ["Percent Optimum Moisture", valueOrDash(report.percentOptimumMoisture || report.percent_optimum_moisture)],
          ["Percent of Plus #4", valueOrDash(report.percentPassingNo4 || report.percent_passing_no4)],
          ["Corrected Maximum Dry Density", valueOrDash(report.correctedMaximumDryDensity || report.corrected_maximum_dry_density)],
          ["Corrected Optimum Moisture", valueOrDash(report.correctedOptimumMoisture || report.corrected_optimum_moisture)],
          ["Minimum Density Required", valueOrDash(report.percentMinimumDensityRequired || report.percent_minimum_density_required)],
          ["Allowed Moisture Range", valueOrDash(calculateMoistureRange(report))]
        ]} />
      </section>}

      {records.length > 0 && <section className="report-section keep-together">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h5 className="text-sm font-bold text-slate-950">Test Records</h5>
          <span className="text-xs font-bold text-slate-500">{records.length} records</span>
        </div>
        <dl className="mt-3 space-y-2 md:hidden">
          {records.map((record, index) => {
            const result = String(record.densityResult || record.density_result || "").toLowerCase();
            const resultClass = result === "fail" ? "text-rose-800" : result === "retest" ? "text-amber-800" : "text-emerald-800";
            return (
              <div key={record.id || index} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-950">Test #{valueOrDash(record.testNo || record.test_no || index + 1)}</p>
                  <span className={`text-[13px] font-bold uppercase ${resultClass}`}>{valueOrDash(record.densityResult || record.density_result)}</span>
                </div>
                <KeyValueList className="mt-1" columns={1} items={[
                  ["Location", valueOrDash(record.location)],
                  ["% Dry Density", valueOrDash(record.percentDryDensity || record.percent_dry_density)],
                  ["Status", valueOrDash(record.testStatus || record.test_status)]
                ]} />
              </div>
            );
          })}
        </dl>
        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
          <table className="min-w-[620px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-white">
              <tr>
                {RECORD_COLUMNS.map((heading) => (
                  <th key={heading} className="border-r border-slate-800 px-2 py-2 font-bold last:border-r-0">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={record.id || index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.testNo || record.test_no || index + 1)}</td>
                  <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.location)}</td>
                  <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.percentDryDensity || record.percent_dry_density)}</td>
                  <td className={`border-r border-t border-slate-200 px-2 py-2 font-semibold ${String(record.densityResult || record.density_result).toLowerCase() === "fail" ? "text-rose-800" : String(record.densityResult || record.density_result).toLowerCase() === "retest" ? "text-amber-800" : "text-emerald-800"}`}>{valueOrDash(record.densityResult || record.density_result)}</td>
                  <td className="border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.testStatus || record.test_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.some((record) => record.moistureOutOfRange || record.moisture_out_of_range) && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            Moisture Out Of Range. Retest Required.
          </p>
        )}
      </section>}

      {records.length > 0 && <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Calculation Formulas</h5>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-6 text-slate-700">
          <p>Dry Density = Wet Density - Moisture Unit Mass</p>
          <p>Moisture Content = Moisture Unit Mass / Dry Density x 100</p>
          <p>Percent Dry Density = Dry Density / Corrected Maximum Dry Density x 100</p>
        </div>
      </section>}
    </div>
  );
}
