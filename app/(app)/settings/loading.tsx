import { PageLoadingSkeleton } from "@/components/app/page-loading-skeleton";

export default function SettingsLoading() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">กำลังโหลดเมนูตั้งค่า...</p>
      </header>
      <PageLoadingSkeleton />
    </section>
  );
}
