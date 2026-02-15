export default function SettingsSuperadminOverviewLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-200" />
          </article>
        ))}
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </article>
    </section>
  );
}
