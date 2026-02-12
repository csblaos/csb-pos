import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function StoresLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">จัดการร้านที่เข้าถึงได้</h1>
        <p className="text-sm text-muted-foreground">
          กำลังโหลดข้อมูลร้านที่คุณเข้าถึงได้...
        </p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
