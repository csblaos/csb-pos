export default function SystemAdminDashboardLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">System Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          ภาพรวมลูกค้าที่สมัครใช้ POS และสถานะการใช้งานระบบ
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Total Client", "Total Store", "Total User", "สมาชิก ACTIVE"].map((label) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Top Client ตามจำนวนร้าน</h2>
            <span className="text-sm text-blue-700">จัดการลูกค้า</span>
          </div>
          <div className="mt-3 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-lg border p-3">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </article>

        <article className="space-y-2 rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">ภาพรวมสิทธิ์สร้างร้าน</h2>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-5 w-full animate-pulse rounded bg-slate-200" />
          ))}
          <span className="inline-block text-sm text-blue-700">ไปหน้าตั้งค่าระบบ</span>
        </article>
      </div>
    </section>
  );
}
