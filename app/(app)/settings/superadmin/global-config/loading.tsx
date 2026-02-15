export default function SettingsSuperadminGlobalConfigLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-2 px-1">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100" />
          </article>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, index) => (
        <article
          key={index}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="mt-1 h-3 w-64 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="space-y-2 px-4 py-3">
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div key={rowIndex} className="h-4 w-full animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
