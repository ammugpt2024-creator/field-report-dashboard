import KeyValueList from "../mobile/KeyValueList";

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

const RECORD_COLUMNS = ["Test #", "Location", "Weight (g)", "Diameter (mm)", "Time (s)", "IR (mm/hr)"];

export default function SurfaceInfiltrationReportInlineContent({ report, reportLabel = "Report" }) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  const pdfUrl = report.pdfUrl || report.pdf_url || report.finalPdfUrl || report.final_pdf_url || "";

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Surface Infiltration Rate Report · ASTM C1781</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {report.reportNumber || "SIR Report"}</h4>
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
          ["Location", valueOrDash(report.location)],
          ["Test Standard", "ASTM C1781"]
        ]} />
      </section>

      {records.length > 0 && (
        <section className="report-section keep-together">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h5 className="text-sm font-bold text-slate-950">Test Records</h5>
            <span className="text-xs font-bold text-slate-500">{records.length} records</span>
          </div>

          <dl className="mt-3 space-y-2 md:hidden">
            {records.map((record, index) => {
              const ir = String(record.infiltrationRate || "").trim();
              return (
                <div key={record.id || index} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-bold text-slate-950">Test #{valueOrDash(record.testNo || index + 1)}</p>
                  <KeyValueList className="mt-1" columns={1} items={[
                    ["Location", valueOrDash(record.location)],
                    ["Weight of Infiltrated Water (g)", valueOrDash(record.weightInfiltratedWater)],
                    ["Inside Diameter of Ring (mm)", valueOrDash(record.insideDiameter)],
                    ["Time Elapsed (s)", valueOrDash(record.timeInfiltration)],
                    ["Infiltration Rate (mm/hr)", ir || "-"]
                  ]} />
                  {ir && (
                    <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800">
                      IR = {ir} mm/hr
                    </div>
                  )}
                </div>
              );
            })}
          </dl>

          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
            <table className="min-w-[640px] w-full border-collapse text-left text-xs">
              <thead className="bg-slate-950 text-white">
                <tr>
                  {RECORD_COLUMNS.map((heading) => (
                    <th key={heading} className="border-r border-slate-800 px-2 py-2 font-bold last:border-r-0">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const ir = String(record.infiltrationRate || "").trim();
                  return (
                    <tr key={record.id || index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.testNo || index + 1)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.location)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.weightInfiltratedWater)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.insideDiameter)}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.timeInfiltration)}</td>
                      <td className={`border-t border-slate-200 px-2 py-2 font-bold ${ir ? "text-emerald-800" : "text-slate-400"}`}>{ir || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Calculation Formula</h5>
        <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-6 text-blue-900">
          <p>IR = (126,870 × W) / (D² × T)</p>
          <p className="mt-1 text-slate-600">W = Weight of infiltrated water (g) · D = Inside diameter of ring (mm) · T = Time elapsed (s)</p>
        </div>
      </section>
    </div>
  );
}
