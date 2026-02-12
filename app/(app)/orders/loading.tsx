import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function OrdersLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">รายการขาย</h1>
        <p className="text-sm text-muted-foreground">
          กำลังโหลดรายการออเดอร์และสถานะล่าสุด...
        </p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
