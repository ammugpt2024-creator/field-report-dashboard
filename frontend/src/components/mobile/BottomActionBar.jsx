export default function BottomActionBar({ primaryLabel, secondaryLabel, onPrimary, onSecondary, disabled = false }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onSecondary}
          className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          className="min-h-12 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
