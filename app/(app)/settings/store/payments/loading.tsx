export default function SettingsStorePaymentsLoading() {
  return (
    <section className="space-y-4">
      <div className="space-y-2 px-1">
        <div className="h-8 w-44 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-16 animate-pulse border-b border-slate-100 bg-slate-50" />
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </article>

      <article className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </article>
    </section>
  );
}
