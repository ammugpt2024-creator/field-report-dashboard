import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, Plus, Trash2 } from "lucide-react";
import { DAILY_LOG_STATUS, saveDailyLog } from "../../services/dailyLogService";
import { generateVdotChecklistPdf } from "../../services/vdotChecklistPdfService";
import {
  ANSWER_OPTIONS,
  ANSWER_TYPES,
  PRIORITY_OPTIONS,
  getChecklistProgress,
  getChecklistSections,
  getInitials,
  getItemAnswerType,
  getMissingRequiredHeaderFields,
  getVdotChecklist,
  isItemFlagged,
  isVdotChecklistComplete
} from "../../configs/vdotChecklists";

const inputClass = (invalid = false) =>
  `min-h-11 w-full rounded-2xl border ${invalid ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"} px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500`;

const cardClass = "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4";

function Field({ label, required, error, className = "", children }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}{required ? " *" : ""}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-rose-700">{error}</span>}
    </label>
  );
}

function FieldInput({ field, value, disabled, invalid, onChange }) {
  if (field.type === "textarea") {
    return (
      <textarea
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className={`${inputClass(invalid)} min-h-28 resize-y py-3 leading-6`}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass(invalid)}>
        <option value="">— Select —</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.type || "text"}
      value={value || ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass(invalid)}
    />
  );
}

// Segmented buttons for an item's answer. The "problem" answer turns red so a
// deficiency stands out while scrolling the list.
function AnswerButtons({ options, value, flagOn, disabled, onChange }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {options.map((option) => {
        const selected = value === option.value;
        const bad = option.value === flagOn;
        const selectedClass = bad ? "bg-rose-600 text-white shadow-sm" : "bg-emerald-600 text-white shadow-sm";
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(selected ? "" : option.value)}
            className={`min-h-9 min-w-[76px] rounded-lg px-3 text-xs font-bold transition ${selected ? selectedClass : "text-slate-600 hover:bg-white"} disabled:cursor-not-allowed`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ChecklistItemRow({ section, item, index, answer, disabled, showMissing, inspectorName, onChange }) {
  const answerType = getItemAnswerType(section, item);
  const options = ANSWER_OPTIONS[answerType];
  const flagged = isItemFlagged(section, item, answer);
  const missing = showMissing && !answer.value;
  const number = section.id.length === 1 ? `${section.id}${index + 1}` : `${index + 1}`;

  function setValue(value) {
    const patch = { value };
    // Marking an MOT item complete stamps the inspector's initials and today,
    // which is what the paper form's two columns are for.
    if (answerType === ANSWER_TYPES.PHASE && value === "complete") {
      if (!answer.initials) patch.initials = getInitials(inspectorName);
      if (!answer.date) patch.date = new Date().toISOString().slice(0, 10);
    }
    if (!isItemFlagged(section, item, { value })) patch.priority = "";
    onChange({ ...answer, ...patch });
  }

  return (
    <div className={`border-t border-slate-100 py-3 first:border-t-0 ${flagged ? "-mx-3 rounded-xl bg-rose-50/70 px-3" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`min-w-0 text-sm font-semibold leading-6 ${missing ? "text-rose-700" : "text-slate-800"}`}>
          <span className="mr-2 text-xs font-bold text-slate-400">{number}</span>
          {item.label}
        </p>
        <AnswerButtons options={options} value={answer.value} flagOn={item.flagOn} disabled={disabled} onChange={setValue} />
      </div>
      {flagged && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-rose-700">Correct within:</span>
          {PRIORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...answer, priority: answer.priority === option.value ? "" : option.value })}
              className={`min-h-8 rounded-lg border px-3 text-xs font-bold ${answer.priority === option.value ? "border-rose-600 bg-rose-600 text-white" : "border-rose-200 bg-white text-rose-700"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {answerType === ANSWER_TYPES.PHASE && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[110px_160px_1fr]">
          <input aria-label="Inspector initials" placeholder="Initials" value={answer.initials || ""} disabled={disabled} onChange={(event) => onChange({ ...answer, initials: event.target.value.toUpperCase() })} className={inputClass()} />
          <input aria-label="Date" type="date" value={answer.date || ""} disabled={disabled} onChange={(event) => onChange({ ...answer, date: event.target.value })} className={inputClass()} />
          <input aria-label="Remarks" placeholder="Remarks" value={answer.remarks || ""} disabled={disabled} onChange={(event) => onChange({ ...answer, remarks: event.target.value })} className={inputClass()} />
        </div>
      )}
    </div>
  );
}

export default function VdotChecklistReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const [attemptedFinish, setAttemptedFinish] = useState(false);
  const [pdfBusy, setPdfBusy] = useState("");
  const report = localReport || persistedReport;
  const checklist = getVdotChecklist(report || {});
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);

  if (!activity || !report || !checklist) {
    return (
      <section className={cardClass}>
        <h1 className="text-xl font-bold text-slate-950">Checklist Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  const sections = getChecklistSections(checklist, report);
  const progress = getChecklistProgress(checklist, report);
  const missingHeader = getMissingRequiredHeaderFields(checklist, report);
  const complete = isVdotChecklistComplete(report);
  const header = report.header || {};
  const answers = report.answers || {};
  const sectionNA = report.sectionNA || {};
  const sectionOptions = report.sectionOptions || {};
  const sectionComments = report.sectionComments || {};
  const footer = report.footer || {};
  const inspectorName = header.inspector || log.technicianName || log.technician_name || "";

  function saveReport(nextReport) {
    const normalized = { ...nextReport, updatedAt: new Date().toISOString() };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) =>
        item.id === activityId
          ? { ...item, reports: (item.reports || []).map((r) => (r.id === normalized.id ? normalized : r)), updatedAt: new Date().toISOString() }
          : item
      ),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function update(patch) {
    if (isReadOnly) return;
    saveReport({ ...report, ...patch });
  }

  function setNested(key, id, value) {
    update({ [key]: { ...(report[key] || {}), [id]: value } });
  }

  function finishReport() {
    setAttemptedFinish(true);
    if (!complete) return;
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  function showPdf(mode) {
    // Open the tab inside the click so popup blockers allow it.
    const targetWindow = mode === "open" ? window.open("", "_blank") : null;
    setPdfBusy(mode);
    try {
      generateVdotChecklistPdf(report, { mode, targetWindow });
    } catch (error) {
      targetWindow?.close();
      window.alert("Could not generate PDF: " + (error.message || "Unknown error"));
    } finally {
      setPdfBusy("");
    }
  }

  const customItems = report.customItems || [];

  return (
    <div className="space-y-4 pb-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">{checklist.kicker}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">{checklist.title}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-300">{report.projectName || log.projectName}</p>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">{checklist.description}</p>
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950">{progress.answered} of {progress.total} items answered</p>
            {checklist.key === "te97001" && (
              <p className={`mt-1 text-xs font-bold ${progress.flagged ? "text-rose-700" : "text-slate-500"}`}>
                {progress.flagged} deficienc{progress.flagged === 1 ? "y" : "ies"} noted{progress.urgent ? ` · ${progress.urgent} urgent` : ""}
              </p>
            )}
          </div>
          <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${report.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            {report.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
            {report.status === "completed" ? "Completed" : "Draft"}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${progress.total ? (progress.answered / progress.total) * 100 : 0}%` }} />
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold text-slate-950">Inspection Details</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {checklist.headerFields.map((field) => {
            const invalid = attemptedFinish && field.required && !String(header[field.key] ?? "").trim();
            return (
              <Field key={field.key} label={field.label} required={field.required} error={invalid ? "Required." : ""}>
                <FieldInput field={field} value={header[field.key]} disabled={isReadOnly} invalid={invalid} onChange={(value) => setNested("header", field.key, value)} />
              </Field>
            );
          })}
        </div>
      </section>

      {sections.map((section) => {
        const na = Boolean(sectionNA[section.id]);
        return (
          <section key={section.id} className={cardClass}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                {checklist.key === "te97001" && <span className="mr-2 text-blue-700">{section.id}.</span>}
                {section.title}
              </h2>
              {section.allowNA && (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input type="checkbox" checked={na} disabled={isReadOnly} onChange={(event) => setNested("sectionNA", section.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Not applicable to this work zone
                </label>
              )}
            </div>
            {section.option && !na && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{section.option.label}:</span>
                {section.option.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setNested("sectionOptions", section.id, sectionOptions[section.id] === choice ? "" : choice)}
                    className={`min-h-8 rounded-lg border px-3 text-xs font-bold ${sectionOptions[section.id] === choice ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
            {na ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">Marked not applicable. Its items are skipped and shown as N/A on the PDF.</p>
            ) : (
              <div className="mt-2">
                {section.items.map((item, index) => (
                  <ChecklistItemRow
                    key={item.id}
                    section={section}
                    item={item}
                    index={index}
                    answer={answers[item.id] || {}}
                    disabled={isReadOnly}
                    showMissing={attemptedFinish}
                    inspectorName={inspectorName}
                    onChange={(answer) => setNested("answers", item.id, answer)}
                  />
                ))}
              </div>
            )}
            {section.answerType !== ANSWER_TYPES.PHASE && !na && (
              <Field label="Comments" className="mt-3">
                <textarea
                  value={sectionComments[section.id] || ""}
                  disabled={isReadOnly}
                  onChange={(event) => setNested("sectionComments", section.id, event.target.value)}
                  rows={2}
                  className={`${inputClass()} min-h-16 resize-y py-2 leading-6`}
                />
              </Field>
            )}
          </section>
        );
      })}

      {checklist.allowCustomItems && (
        <section className={cardClass}>
          <h2 className="text-lg font-bold text-slate-950">Add Items</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">The paper form has {checklist.allowCustomItems} blank rows for site-specific items. Name an item here and it appears in an “Additional Items” section above.</p>
          <div className="mt-3 space-y-2">
            {customItems.map((item) => (
              <div key={item.id} className="flex gap-2">
                <input
                  value={item.label || ""}
                  disabled={isReadOnly}
                  placeholder="Item description"
                  onChange={(event) => update({ customItems: customItems.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)) })}
                  className={inputClass()}
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    aria-label="Remove item"
                    onClick={() => {
                      const restAnswers = { ...answers };
                      delete restAnswers[item.id];
                      update({ customItems: customItems.filter((entry) => entry.id !== item.id), answers: restAnswers });
                    }}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200 text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!isReadOnly && customItems.length < checklist.allowCustomItems && (
            <button
              type="button"
              onClick={() => update({ customItems: [...customItems, { id: `custom_${crypto.randomUUID()}`, label: "" }] })}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          )}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="text-lg font-bold text-slate-950">{checklist.key === "mot" ? "Remarks" : "Review & Sign-off"}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {checklist.footerFields
            .filter((field) => field.key !== "copyToOther" || footer.copyTo === "Other")
            .map((field) => (
              <Field key={field.key} label={field.label} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                <FieldInput field={field} value={footer[field.key]} disabled={isReadOnly} onChange={(value) => setNested("footer", field.key, value)} />
              </Field>
            ))}
        </div>
      </section>

      {attemptedFinish && !complete && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Finish needs {missingHeader.length ? `${missingHeader.map((field) => field.label).join(", ")} filled in` : ""}
            {missingHeader.length > 0 && progress.answered < progress.total ? " and " : ""}
            {progress.answered < progress.total ? `${progress.total - progress.answered} more item${progress.total - progress.answered === 1 ? "" : "s"} answered (shown in red)` : ""}.
            Mark sections that don’t apply as not applicable.
          </span>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:flex-wrap sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        <button type="button" onClick={() => showPdf("open")} disabled={Boolean(pdfBusy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
          <Eye className="h-4 w-4" />
          View PDF
        </button>
        <button type="button" onClick={() => showPdf("download")} disabled={Boolean(pdfBusy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
          <Download className="h-4 w-4" />
          Download PDF
        </button>
        {!isReadOnly && <button type="button" onClick={() => saveReport(report)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={finishReport} className={`min-h-11 rounded-2xl px-4 text-sm font-bold text-white ${complete ? "bg-emerald-700" : "bg-slate-400"}`}>Finish Report</button>}
      </div>
    </div>
  );
}
