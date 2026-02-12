import Link from "next/link";
import { Settings2, ShieldCheck, Users } from "lucide-react";

const menus = [
  {
    href: "/system-admin/config/clients",
    title: "Manage Client",
    description: "จัดการบัญชี SUPERADMIN และโควตาการสร้างร้าน",
    icon: Users,
  },
  {
    href: "/system-admin/config/system",
    title: "System Config",
    description: "ตั้งค่าระบบกลางและนโยบายหลักของแพลตฟอร์ม",
    icon: Settings2,
  },
  {
    href: "/system-admin/config/security",
    title: "Security",
    description: "ดูแนวทางความปลอดภัยและนโยบายการเข้าถึง",
    icon: ShieldCheck,
  },
];

export default function SystemAdminConfigPage() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Config Center</h1>
        <p className="text-sm text-muted-foreground">
          รวมเมนูตั้งค่าหลักสำหรับผู้ดูแลระบบ POS ทั้งระบบ
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {menus.map((menu) => {
          const Icon = menu.icon;

          return (
            <Link
              key={menu.href}
              href={menu.href}
              prefetch
              className="rounded-xl border bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
            >
              <Icon className="h-5 w-5 text-blue-700" />
              <h2 className="mt-3 text-sm font-semibold">{menu.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{menu.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
