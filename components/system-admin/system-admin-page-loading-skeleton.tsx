type SystemAdminLoadingVariant =
  | "dashboard"
  | "config-menu"
  | "clients"
  | "detail";

type SystemAdminPageLoadingSkeletonProps = {
  variant?: SystemAdminLoadingVariant;
};

const pulseBlock = "animate-pulse rounded bg-slate-200";

export function SystemAdminPageLoadingSkeleton({
  variant = "dashboard",
}: SystemAdminPageLoadingSkeletonProps) {
  if (variant === "config-menu") {
    return (
      <section className="space-y-4">
        <div className="animate-pulse space-y-2">
          <div className="h-6 w-40 rounded bg-slate-300/80" />
          <div className="h-4 w-72 rounded bg-slate-200" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl border bg-white p-4"
            >
              <div className="h-5 w-5 rounded bg-slate-200" />
              <div className="mt-3 h-4 w-36 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-full rounded bg-slate-200" />
              <div className="mt-1 h-3 w-10/12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === "clients") {
    return (
      <section className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded bg-slate-300/80" />
          <div className="h-4 w-80 rounded bg-slate-200" />
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={`${pulseBlock} h-10`} />
            ))}
          </div>
          <div className="mt-3 h-10 w-full animate-pulse rounded bg-slate-200" />
        </div>

        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-xl border bg-white p-4">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-56 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-full rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === "detail") {
    return (
      <section className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-slate-300/80" />
          <div className="h-4 w-72 rounded bg-slate-200" />
        </div>
        <article className="rounded-xl border bg-white p-4">
          <div className="space-y-2">
            <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-10/12 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-8/12 animate-pulse rounded bg-slate-200" />
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="animate-pulse rounded-2xl bg-slate-200/80 p-5">
        <div className="h-3 w-28 rounded bg-slate-300/90" />
        <div className="mt-3 h-6 w-56 rounded bg-slate-300/90" />
        <div className="mt-3 h-4 w-72 rounded bg-slate-300/90" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border bg-white p-4"
          >
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl border bg-white p-4 lg:col-span-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-lg border p-3">
              <div className="h-4 w-44 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-56 rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border bg-white p-4">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-200" />
          <div className="h-3 w-11/12 rounded bg-slate-200" />
          <div className="h-3 w-10/12 rounded bg-slate-200" />
        </div>
      </div>
    </section>
  );
}
