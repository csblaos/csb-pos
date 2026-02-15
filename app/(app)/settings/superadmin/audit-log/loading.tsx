export default function SettingsSuperadminAuditLogLoading() {
  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <div className="h-8 w-52 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      </header>

      <article className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="h-3 w-full animate-pulse rounded bg-amber-200/70" />
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </article>
    </section>
  );
}
