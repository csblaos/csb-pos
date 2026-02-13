export default function SettingsUsersLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <div className="h-8 w-60 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
      </header>

      <section className="space-y-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          </div>
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
              </li>
            ))}
          </ul>
        </article>
      </section>
    </section>
  );
}
