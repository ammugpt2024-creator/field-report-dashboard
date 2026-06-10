export default function DailyLogMetric({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>}
    </article>
  );
}
