import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  FileText,
  Save,
  Send,
  Sun,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { createFieldReport, saveFieldReport, FIELD_REPORT_STATUS } from "../services/fieldReportService";

const WEATHER_CONDITIONS = ["Clear / Sunny", "Partly Cloudy", "Overcast", "Light Rain", "Heavy Rain", "Windy", "Foggy", "Extreme Heat"];

const SHIFT_OPTIONS = [
  { value: "day", label: "Day Shift" },
  { value: "night", label: "Night Shift" },
];

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-slate-950">{title}</h2>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}{required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const textareaCls = `${inputCls} resize-none`;

export default function FieldReportCreate() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => createFieldReport({ projectId }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!form.date) errs.date = "Required";
    if (!form.inspectorName.trim()) errs.inspectorName = "Required";
    if (!form.activitiesPerformed.trim()) errs.activitiesPerformed = "Required";
    return errs;
  }

  function handleSave(status) {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    saveFieldReport({ ...form, status, projectId });
    navigate(`/project/${projectId}/field-reports`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/project/${projectId}/field-reports`)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <h1 className="text-xl font-bold text-slate-950">New Field Operations Report</h1>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Report No. <span className="font-bold text-slate-700">{form.reportNumber}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(FIELD_REPORT_STATUS.DRAFT)}
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              <button
                onClick={() => handleSave(FIELD_REPORT_STATUS.SUBMITTED)}
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Submit Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Body */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="space-y-6">

          {/* Report Details */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader icon={ClipboardList} title="Report Details" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Report Date" required>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className={`${inputCls} ${errors.date ? "border-rose-400" : ""}`}
                />
                {errors.date && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.date}</p>}
              </Field>
              <Field label="Shift">
                <select
                  value={form.shift}
                  onChange={(e) => set("shift", e.target.value)}
                  className={inputCls}
                >
                  {SHIFT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Inspector / Technician" required>
                <input
                  type="text"
                  value={form.inspectorName}
                  onChange={(e) => set("inspectorName", e.target.value)}
                  placeholder="Full name"
                  className={`${inputCls} ${errors.inspectorName ? "border-rose-400" : ""}`}
                />
                {errors.inspectorName && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.inspectorName}</p>}
              </Field>
            </div>
          </div>

          {/* Site Conditions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader icon={Sun} title="Site Conditions" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Weather Condition">
                <select
                  value={form.weatherCondition}
                  onChange={(e) => set("weatherCondition", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select condition</option>
                  {WEATHER_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Temperature (°C)">
                <input
                  type="text"
                  value={form.temperature}
                  onChange={(e) => set("temperature", e.target.value)}
                  placeholder="e.g. 28"
                  className={inputCls}
                />
              </Field>
              <Field label="Workers On Site">
                <input
                  type="number"
                  min="0"
                  value={form.workersOnSite}
                  onChange={(e) => set("workersOnSite", e.target.value)}
                  placeholder="Count"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          {/* Field Activities */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader icon={ClipboardList} title="Field Activities" />
            <div className="space-y-4">
              <Field label="Activities Performed" required>
                <textarea
                  rows={4}
                  value={form.activitiesPerformed}
                  onChange={(e) => set("activitiesPerformed", e.target.value)}
                  placeholder="Describe all work activities completed during this shift..."
                  className={`${textareaCls} ${errors.activitiesPerformed ? "border-rose-400" : ""}`}
                />
                {errors.activitiesPerformed && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.activitiesPerformed}</p>}
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Equipment Used">
                  <textarea
                    rows={3}
                    value={form.equipmentUsed}
                    onChange={(e) => set("equipmentUsed", e.target.value)}
                    placeholder="List equipment and machinery on site..."
                    className={textareaCls}
                  />
                </Field>
                <Field label="Materials Delivered">
                  <textarea
                    rows={3}
                    value={form.materialsDelivered}
                    onChange={(e) => set("materialsDelivered", e.target.value)}
                    placeholder="List any materials received on site..."
                    className={textareaCls}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Safety & Remarks */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader icon={ShieldCheck} title="Safety & Remarks" />
            <div className="space-y-4">
              <Field label="Safety Observations">
                <textarea
                  rows={3}
                  value={form.safetyObservations}
                  onChange={(e) => set("safetyObservations", e.target.value)}
                  placeholder="Record any safety incidents, near-misses, or observations..."
                  className={textareaCls}
                />
              </Field>
              <Field label="Additional Remarks">
                <textarea
                  rows={3}
                  value={form.remarks}
                  onChange={(e) => set("remarks", e.target.value)}
                  placeholder="Any other notes or observations for this report..."
                  className={textareaCls}
                />
              </Field>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={() => navigate(`/project/${projectId}/field-reports`)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave(FIELD_REPORT_STATUS.DRAFT)}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save as Draft
            </button>
            <button
              onClick={() => handleSave(FIELD_REPORT_STATUS.SUBMITTED)}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Submit Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
