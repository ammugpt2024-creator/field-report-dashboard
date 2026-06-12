// Compact label–value rows for read-only details (specs, summaries, report
// headers). Replaces the big one-box-per-field grids that made report pages
// scroll forever on phones: one tight row per field, two columns from sm up.
export default function KeyValueList({ items, columns = 2, className = "" }) {
  const visible = (items || []).filter((item) => Array.isArray(item) && item[0]);
  const columnClass = columns >= 3
    ? "sm:grid-cols-2 xl:grid-cols-3"
    : columns === 2
      ? "sm:grid-cols-2"
      : "";
  return (
    <dl className={`grid grid-cols-1 gap-x-8 ${columnClass} ${className}`}>
      {visible.map(([label, value]) => {
        const text = value === null || value === undefined || value === "" ? "-" : value;
        // Long values wrap badly when right-aligned beside the label —
        // stack them under it, left-aligned, instead.
        const isLong = typeof text === "string" && text.length > 24;
        return isLong ? (
          <div key={label} className="min-w-0 border-b border-slate-100 py-2">
            <dt className="text-[13px] font-semibold text-slate-500">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-bold leading-snug text-slate-900">{text}</dd>
          </div>
        ) : (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-2">
            <dt className="shrink-0 text-[13px] font-semibold text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words text-right text-sm font-bold text-slate-900">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
