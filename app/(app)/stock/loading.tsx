import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function StockLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">สต็อก</h1>
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลสต็อก...</p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
