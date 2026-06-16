import KeyValueList from "../mobile/KeyValueList";

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function SamplesCollectionReportInlineContent({ report, reportLabel = "Report" }) {
  const pdfUrl = report.pdfUrl || report.pdf_url || report.finalPdfUrl || report.final_pdf_url || "";
  const comments = String(report.comments || "").trim();

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Samples Collection Report</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {valueOrDash(report.sampleType)}</h4>
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
        <h5 className="text-sm font-bold text-slate-950">Collection Details</h5>
        <KeyValueList className="mt-2" columns={3} items={[
          ["Project Name", valueOrDash(report.projectName || report.project_name)],
          ["Project Number", valueOrDash(report.projectNumber || report.project_number)],
          ["Sample Type", valueOrDash(report.sampleType)],
          ["Cast Date", valueOrDash(report.castDate || report.cast_date)],
          ["Samples / Specimens", valueOrDash(report.specimenCount || report.specimen_count)],
          ["Date Collected", valueOrDash(report.date)]
        ]} />
      </section>

      {comments && (
        <section className="report-section keep-together">
          <h5 className="text-sm font-bold text-slate-950">Comments</h5>
          <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">{comments}</p>
        </section>
      )}
    </div>
  );
}
