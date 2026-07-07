function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function AsphaltCompactionReportInlineContent({ report, reportLabel = "Report" }) {
  const materialGroups = Array.isArray(report.materialGroups) ? report.materialGroups : [];

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Asphalt Compaction Report</p>
        <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {report.reportNumber || "Asphalt Report"}</h4>
      </section>

      <section>
        <h5 className="text-sm font-bold text-slate-950">Gauge Information</h5>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {[
            ["Serial Number", report.serialNumber],
            ["Gauge Model", report.gaugeModel],
            ["Calibration Due", report.calibrationDueDate],
            ["Standardized", report.standardizedGauge],
            ["Std Count Density", report.standardDensity],
            ["Std Count Moisture", report.standardMoisture]
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-bold text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {materialGroups.map((group, index) => {
        const records = Array.isArray(group.testRecords) ? group.testRecords : [];
        const passCount = records.filter(r => r.result === "PASS").length;
        const failCount = records.filter(r => r.result === "FAIL").length;
        return (
          <section key={group.id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h5 className="text-sm font-bold text-slate-950">Material {index + 1} — {valueOrDash(group.mixId)}</h5>
              {records.length > 0 && (
                <div className="flex gap-2 text-xs font-bold">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{passCount} PASS</span>
                  {failCount > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{failCount} FAIL</span>}
                </div>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-bold text-slate-500">Marshall Value</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(group.marshallValue)} pcf</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Required Compaction</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(group.requiredCompaction)}%</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Tests</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{records.length}</dd>
              </div>
            </dl>
            {records.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[400px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      <th className="border-r border-slate-800 px-2 py-2 font-bold">Test #</th>
                      <th className="border-r border-slate-800 px-2 py-2 font-bold">Location</th>
                      <th className="border-r border-slate-800 px-2 py-2 font-bold">Field Density</th>
                      <th className="border-r border-slate-800 px-2 py-2 font-bold">Compaction %</th>
                      <th className="px-2 py-2 font-bold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, rIndex) => (
                      <tr key={record.id || rIndex} className={rIndex % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.testNo)}</td>
                        <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.location)}</td>
                        <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.fieldDensity)} pcf</td>
                        <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.compactionPercent)}%</td>
                        <td className={`border-t border-slate-200 px-2 py-2 font-bold ${record.result === "PASS" ? "text-emerald-700" : record.result === "FAIL" ? "text-rose-700" : "text-slate-500"}`}>
                          {valueOrDash(record.result)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {(report.coresTaken === "Yes" || report.coresTaken === "No") && (
        <section>
          <h5 className="text-sm font-bold text-slate-950">Cores</h5>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-bold text-slate-500">Cores Taken</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(report.coresTaken)}</dd>
            </div>
            {report.coresTaken === "Yes" && (
              <>
                <div>
                  <dt className="font-bold text-slate-500">Count</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(report.coreCount)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Locations</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">{valueOrDash(report.coreLocations)}</dd>
                </div>
                {report.coreNotes && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="font-bold text-slate-500">Notes</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{report.coreNotes}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
