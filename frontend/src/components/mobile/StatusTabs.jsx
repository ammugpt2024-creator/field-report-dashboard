// Segmented status control shared by list screens (daily logs, timesheets).
// Grey track, white active segment with a soft shadow, and toned count
// badges. Tabs share the strip width on phones so nothing scrolls or clips.
const STATUS_TAB_TONES = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  returned: "bg-rose-50 text-rose-700",
  approved: "bg-emerald-50 text-emerald-700"
};

export default function StatusTabs({ tabs, activeTab, onChange, counts = {} }) {
  return (
    <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 sm:gap-1.5">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const count = Number.isFinite(counts[tab.id]) ? counts[tab.id] : null;
        const badgeTone = count
          ? STATUS_TAB_TONES[tab.id] || "bg-slate-100 text-slate-600"
          : active
            ? "bg-slate-100 text-slate-400"
            : "bg-slate-200/70 text-slate-400";
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-9 min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 text-[11px] font-bold transition sm:min-h-10 sm:flex-none sm:gap-1.5 sm:px-4 sm:text-sm ${
              active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {tab.label}
            {count !== null && (
              <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none ${badgeTone}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
