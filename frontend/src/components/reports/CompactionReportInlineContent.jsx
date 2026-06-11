function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function FieldValue({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">{valueOrDash(value)}</p>
    </div>
  );
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
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
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
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <FieldValue label="Project Name" value={report.projectName || report.project_name} />
          <FieldValue label="Project Number" value={report.projectNumber || report.project_number} />
          <FieldValue label="Section" value={report.section} />
          <FieldValue label="Date" value={report.date} />
          <FieldValue label="Client" value={report.client} />
          <FieldValue label="Test For" value={report.testFor || report.test_for} />
        </div>
      </section>

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Gauge & Material</h5>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <FieldValue label="Serial Number" value={report.serialNumber || report.serial_number} />
          <FieldValue label="Gauge Model" value={report.gaugeModel || report.gauge_model} />
          <FieldValue label="Calibration Due" value={report.calibrationDueDate || report.calibration_due_date} />
          <FieldValue label="Standardized" value={report.standardizedGauge || report.standardized_gauge} />
          <FieldValue label="Material Type" value={report.materialType || report.material_type} />
          <FieldValue label="Material Name" value={report.materialName || report.material_name} />
          <FieldValue label="Standard Density" value={report.standardDensity || report.standard_density} />
          <FieldValue label="Standard Moisture" value={report.standardMoisture || report.standard_moisture} />
        </div>
      </section>

      {hasSpecs && <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Specifications</h5>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <FieldValue label="Maximum Dry Density" value={report.maximumDryDensity || report.maximum_dry_density} />
          <FieldValue label="Percent Optimum Moisture" value={report.percentOptimumMoisture || report.percent_optimum_moisture} />
          <FieldValue label="Percent of Plus #4" value={report.percentPassingNo4 || report.percent_passing_no4} />
          <FieldValue label="Corrected Maximum Dry Density" value={report.correctedMaximumDryDensity || report.corrected_maximum_dry_density} />
          <FieldValue label="Corrected Optimum Moisture" value={report.correctedOptimumMoisture || report.corrected_optimum_moisture} />
          <FieldValue label="Minimum Density Required" value={report.percentMinimumDensityRequired || report.percent_minimum_density_required} />
          <FieldValue label="Allowed Moisture Range" value={calculateMoistureRange(report)} />
        </div>
      </section>}

      {records.length > 0 && <section className="report-section keep-together">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h5 className="text-sm font-bold text-slate-950">Test Records</h5>
          <span className="text-xs font-bold text-slate-500">{records.length} records</span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
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
