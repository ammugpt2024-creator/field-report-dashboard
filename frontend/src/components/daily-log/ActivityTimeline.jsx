export default function ActivityTimeline({ items = [] }) {
  const displayItems = items.length ? items : [
    { id: "1", time: "08:00 AM", label: "Concrete Placement Started", detail: "Tunnel Section A" },
    { id: "2", time: "09:20 AM", label: "Concrete Sampling Added", detail: "Zone C" },
    { id: "3", time: "10:45 AM", label: "Inspection Photos Uploaded", detail: "Shaft 3" }
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Activity Timeline</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Recent Field Activity</h2>
      <div className="mt-5 space-y-4">
        {displayItems.map((item) => (
          <div key={item.id} className="flex gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-700" />
            <div className="min-w-0 border-b border-slate-100 pb-4 last:border-b-0">
              <p className="text-sm font-bold text-slate-950">{item.time}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{item.label}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
