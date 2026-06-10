import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import {
  AI_SUMMARY_ACTIONS,
  AI_SUMMARY_TYPES,
  cacheAiSummary,
  generateDailySummary,
  getCachedAiSummary
} from "../../services/aiSummaryService";

function actionButtonClass(primary = false) {
  return primary
    ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60";
}

export default function AiDailySummaryCard({ log, onSaveSummary }) {
  const editorRef = useRef(null);
  const [generatedContent, setGeneratedContent] = useState("");
  const [editedContent, setEditedContent] = useState(log.dailySummary || "");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const plainActivityCount = useMemo(() => (log.activities || []).length, [log.activities]);

  useEffect(() => {
    const cached = getCachedAiSummary(log.id, AI_SUMMARY_TYPES.EXECUTIVE);
    if (cached) {
      setGeneratedContent(cached.generatedContent || "");
      setEditedContent(cached.editedContent || cached.generatedContent || log.dailySummary || "");
      return;
    }
    setGeneratedContent("");
    setEditedContent(log.dailySummary || "");
  }, [log.dailySummary, log.id]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== editedContent) {
      editorRef.current.innerHTML = editedContent || "";
    }
  }, [editedContent]);

  async function generateSummary() {
    setStatus("generating");
    setError("");
    try {
      const summary = await generateDailySummary({
        log,
        summaryType: AI_SUMMARY_TYPES.EXECUTIVE,
        action: AI_SUMMARY_ACTIONS.GENERATE,
        currentContent: editorRef.current?.innerHTML || editedContent
      });
      setGeneratedContent(summary.generatedContent || "");
      setEditedContent(summary.editedContent || summary.generatedContent || "");
      setStatus("completed");
    } catch (err) {
      console.error("AI daily summary failed", err);
      setError("Unable to generate summary.");
      setStatus("failed");
    }
  }

  function saveSummary() {
    const nextContent = editorRef.current?.innerHTML || editedContent;
    setEditedContent(nextContent);
    cacheAiSummary(log.id, AI_SUMMARY_TYPES.EXECUTIVE, {
      summaryType: AI_SUMMARY_TYPES.EXECUTIVE,
      generatedContent,
      editedContent: nextContent,
      generationStatus: generatedContent ? "edited" : "manual"
    });
    onSaveSummary(nextContent, AI_SUMMARY_TYPES.EXECUTIVE);
    setStatus("saved");
  }

  if (plainActivityCount === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Executive Summary</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">Professional summary generated from daily field activities and reports.</h2>
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
          Complete at least one activity before generating a summary.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Executive Summary</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Professional summary generated from daily field activities and reports.</h2>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={generateSummary} disabled={status === "generating"} className={actionButtonClass(true)}>
            <Sparkles className="h-4 w-4" />
            Generate Summary
          </button>
        </div>

        <div className="min-w-0">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(event) => setEditedContent(event.currentTarget.innerHTML)}
            className="prose prose-slate mt-3 min-h-[320px] max-w-none rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-7 text-slate-800 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
          />

          {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>}
          {status === "generating" && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">Generating professional summary...</div>}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-500">
              {status === "saved" ? "Summary saved." : "Summary can be edited before Daily Log submission."}
            </p>
            <button type="button" onClick={saveSummary} className={actionButtonClass(true)}>
              <Save className="h-4 w-4" />
              Save Summary
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
