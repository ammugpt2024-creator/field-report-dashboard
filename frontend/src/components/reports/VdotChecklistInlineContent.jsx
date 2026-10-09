import KeyValueList from "../mobile/KeyValueList";
import { generateVdotChecklistPdf } from "../../services/vdotChecklistPdfService";
import {
  getAnswerLabel,
  getChecklistProgress,
  getChecklistSections,
  getPriorityLabel,
  getVdotChecklist,
  isItemFlagged
} from "../../configs/vdotChecklists";

function valueOrDash(value) {
  return value === null || value === undefined || String(value).trim() === "" ? "-" : String(value);
}

export default function VdotChecklistInlineContent({ report, reportLabel = "Report" }) {
  const checklist = getVdotChecklist(report);
  if (!checklist) return null;
  const header = report.header || {};
  const answers = report.answers || {};
  const sectionNA = report.sectionNA || {};
  const progress = getChecklistProgress(checklist, report);
  const deficiencies = [];
  getChecklistSections(checklist, report).forEach((section) => {
    if (sectionNA[section.id]) return;
    section.items.forEach((item) => {
      const answer = answers[item.id] || {};
      if (isItemFlagged(section, item, answer)) {
        deficiencies.push({ section, item, answer });
      }
    });
  });
  const keyFields = checklist.headerFields.filter((field) => field.required || ["contractor", "contractorHq", "postedSpeed"].includes(field.key));

  function showPdf(mode) {
    const targetWindow = mode === "open" ? window.open("", "_blank") : null;
    try {
      generateVdotChecklistPdf(report, { mode, targetWindow });
    } catch (error) {
      targetWindow?.close();
      window.alert("Could not generate PDF: " + (error.message || "Unknown error"));
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{checklist.shortTitle}</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">
              {reportLabel} · {progress.answered}/{progress.total} items
              {checklist.key === "te97001" ? ` · ${progress.flagged} deficienc${progress.flagged === 1 ? "y" : "ies"}` : ""}
            </h4>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => showPdf("open")} className="inline-flex min-h-9 items-center rounded-xl bg-slate-950 px-3 text-xs font-bold text-white">View PDF</button>
            <button type="button" onClick={() => showPdf("download")} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">Download PDF</button>
          </div>
        </div>
      </section>

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Inspection Details</h5>
        <KeyValueList className="mt-2" columns={3} items={keyFields.map((field) => [field.label, valueOrDash(header[field.key])])} />
      </section>

      {deficiencies.length > 0 && (
        <section className="report-section keep-together">
          <h5 className="text-sm font-bold text-rose-800">Deficiencies</h5>
          <ul className="mt-2 space-y-1">
            {deficiencies.map(({ section, item, answer }) => (
              <li key={item.id} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                <span className="font-bold">{section.title}:</span> {item.label} — {getAnswerLabel(section, item, answer)}
                {answer.priority && <span className="ml-1 font-bold">({getPriorityLabel(answer.priority)})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
