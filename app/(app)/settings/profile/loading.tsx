export default function SettingsProfileLoading() {
  return (
    <section className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2 px-1">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-14 animate-pulse border-b border-slate-100 bg-slate-50/70" />
        <div className="h-16 animate-pulse border-b border-slate-100 bg-slate-50/40" />
        <div className="h-16 animate-pulse bg-slate-50/20" />
      </div>
    </section>
  );
}
