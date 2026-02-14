export default function SettingsStoresLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <div className="h-8 w-60 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      </header>

      <div className="space-y-2">
        <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded-md bg-slate-200" />
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
