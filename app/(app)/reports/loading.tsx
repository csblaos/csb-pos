import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function ReportsLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลรายงาน...</p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
