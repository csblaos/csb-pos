export function PageLoadingSkeleton() {
  return (
    <section className="space-y-4">
      <div className="animate-pulse rounded-2xl bg-slate-200/80 p-5">
        <div className="h-3 w-24 rounded bg-slate-300/90" />
        <div className="mt-3 h-6 w-48 rounded bg-slate-300/90" />
        <div className="mt-3 h-4 w-56 rounded bg-slate-300/90" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border bg-white p-4"
          >
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-14 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border bg-white p-4"
          >
            <div className="h-4 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-full rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </section>
  );
}
