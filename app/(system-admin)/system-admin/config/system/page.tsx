export default function SystemAdminSystemConfigPage() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">System Config</h1>
        <p className="text-sm text-muted-foreground">
          หน้าตั้งค่าระบบกลางสำหรับกำหนด policy รวมของแพลตฟอร์ม
        </p>
      </header>

      <article className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">คำแนะนำ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          สามารถเพิ่มเมนูตั้งค่าแพ็กเกจ (Basic / Standard / Premium), นโยบาย session,
          และ default quota ต่อ client ได้ในหน้านี้
        </p>
      </article>
    </section>
  );
}
