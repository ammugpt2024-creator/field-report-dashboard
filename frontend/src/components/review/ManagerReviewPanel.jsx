export default function ManagerReviewPanel({ comments = [] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Manager Review</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Manager Review Comments</h2>
      <div className="mt-4 space-y-3">
        {comments.length ? comments.map((comment) => (
          <article key={comment.id} className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-950">{comment.author || "Manager"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{comment.comment}</p>
          </article>
        )) : (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No manager comments yet.</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" className="min-h-11 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800">Approve</button>
        <button type="button" className="min-h-11 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800">Request Revision</button>
        <button type="button" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Add Comment</button>
      </div>
    </section>
  );
}
