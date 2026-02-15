export default function SettingsSuperadminRootLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-2 px-1">
        <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-slate-100" />
      </header>

      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className={`flex min-h-14 items-center gap-3 px-4 py-3 ${
                index < 4 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </article>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-100" />
          </article>
        ))}
      </div>
    </section>
  );
}
