export default function SystemAdminSecurityPage() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          เมนูดูแลความปลอดภัยระบบกลาง เช่น session, role และ audit policy
        </p>
      </header>

      <article className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">สถานะปัจจุบัน</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ระบบรองรับการบังคับ session ผ่าน Redis และกำหนด role ระดับ SYSTEM_ADMIN,
          SUPERADMIN, USER แล้ว
        </p>
      </article>
    </section>
  );
}
