import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function ProductsLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลสินค้า...</p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
