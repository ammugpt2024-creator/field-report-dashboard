import { useState } from "react";
import { ChevronDown } from "lucide-react";

// One table row rendered as a phone-friendly card: title + status pill, the
// key fields as compact rows, and the long tail behind a "View details"
// expander. Pair with `hidden md:block` on the real table and `md:hidden`
// on the card list.
export default function MobileRecordCard({ title, status, fields = [], details = [], actions = null }) {
  const [expanded, setExpanded] = useState(false);
  const visibleDetails = details.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "-");
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold text-slate-950">{title}</p>
        {status}
      </div>
      <dl className="mt-2">
        {fields.map(([label, value]) => {
          const text = value === null || value === undefined || value === "" ? "-" : value;
          const isLong = typeof text === "string" && text.length > 24;
          return isLong ? (
            <div key={label} className="min-w-0 border-b border-slate-100 py-1.5 last:border-b-0">
              <dt className="text-[12px] font-semibold text-slate-500">{label}</dt>
              <dd className="mt-0.5 break-words text-[13px] font-bold leading-snug text-slate-900">{text}</dd>
            </div>
          ) : (
            <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
              <dt className="shrink-0 text-[12px] font-semibold text-slate-500">{label}</dt>
              <dd className="min-w-0 break-words text-right text-[13px] font-bold text-slate-900">{text}</dd>
            </div>
          );
        })}
      </dl>
      {visibleDetails.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-2 inline-flex min-h-9 items-center gap-1 text-[13px] font-bold text-blue-700"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Hide details" : "View details"}
          </button>
          {expanded && (
            <dl className="mt-1 rounded-xl bg-slate-50 px-3 py-1">
              {visibleDetails.map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
                  <dt className="shrink-0 text-[12px] font-semibold text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words text-right text-[13px] font-bold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}
