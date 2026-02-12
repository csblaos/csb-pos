export default function DashboardLoading() {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-5 text-white">
        <p className="text-sm text-white/80">สวัสดี</p>
        <h1 className="text-xl font-semibold">กำลังโหลดแดชบอร์ด...</h1>
        <p className="mt-1 text-sm text-white/80">
          ยอดขายวันนี้ <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/30" />
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {["ออเดอร์วันนี้", "รอชำระ", "สินค้าใกล้หมด", "บทบาทในร้าน"].map((label) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-medium">สินค้าใกล้หมด (≤ 10 หน่วยหลัก)</p>
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      </div>
    </section>
  );
}
