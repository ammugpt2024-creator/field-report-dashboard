import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, List, Save, Sparkles } from "lucide-react";
import { generateSiteConditionsSummary } from "../../services/aiSummaryService";

function editorButtonClass() {
  return "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50";
}

export default function SiteConditionsCard({ log, onSave }) {
  const editorRef = useRef(null);
  const [content, setContent] = useState(log.siteConditions || "");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setContent(log.siteConditions || "");
  }, [log.siteConditions]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || "";
    }
  }, [content]);

  function runEditorCommand(command, value = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML || "");
  }

  async function generateSummary() {
    setStatus("generating");
    setError("");
    try {
      const summary = await generateSiteConditionsSummary({
        log,
        currentContent: editorRef.current?.innerHTML || content
      });
      setContent(summary.editedContent || summary.generatedContent || "");
      setStatus("completed");
    } catch (err) {
      console.error("AI site conditions failed", err);
      setError("Unable to generate summary.");
      setStatus("failed");
    }
  }

  function saveSiteConditions() {
    const nextContent = editorRef.current?.innerHTML || content;
    setContent(nextContent);
    onSave(nextContent);
    setStatus("saved");
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Site Conditions</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Site Conditions Narrative</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Document access, readiness, ground conditions, safety concerns, staging, restrictions, and work area observations.</p>
        </div>
        <button type="button" onClick={generateSummary} disabled={status === "generating"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-60">
          <Sparkles className="h-4 w-4" />
          Generate Site Conditions Summary
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <button type="button" onClick={() => runEditorCommand("formatBlock", "h2")} className={editorButtonClass()}><Heading2 className="h-4 w-4" /> Heading</button>
        <button type="button" onClick={() => runEditorCommand("bold")} className={editorButtonClass()}><Bold className="h-4 w-4" /> Bold</button>
        <button type="button" onClick={() => runEditorCommand("insertUnorderedList")} className={editorButtonClass()}><List className="h-4 w-4" /> Bullets</button>
      </div>

      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>}
      {status === "generating" && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">Generating site conditions language...</div>}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => setContent(event.currentTarget.innerHTML)}
        className="prose prose-slate mt-3 min-h-[260px] max-w-none rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-7 text-slate-800 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
      />

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={saveSiteConditions} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
          <Save className="h-4 w-4" />
          Save Site Conditions
        </button>
      </div>
    </section>
  );
}
