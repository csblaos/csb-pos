import Link from "next/link";

type AccountStatus = "INVITED" | "SUSPENDED" | "NO_ACTIVE_STORE";

const statusContent: Record<
  AccountStatus,
  { title: string; description: string; badgeClassName: string }
> = {
  INVITED: {
    title: "บัญชีของคุณอยู่สถานะ INVITED",
    description:
      "บัญชีนี้ยังอยู่ระหว่างรอเปิดใช้งาน คุณยังไม่สามารถเข้าใช้งานระบบได้ กรุณาติดต่อแอดมินร้าน",
    badgeClassName: "border-amber-300 bg-amber-50 text-amber-700",
  },
  SUSPENDED: {
    title: "บัญชีของคุณอยู่สถานะ SUSPENDED",
    description:
      "บัญชีนี้ถูกระงับการใช้งาน คุณยังไม่สามารถเข้าใช้งานระบบได้ กรุณาติดต่อแอดมินร้าน",
    badgeClassName: "border-rose-300 bg-rose-50 text-rose-700",
  },
  NO_ACTIVE_STORE: {
    title: "บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งานระบบ",
    description: "กรุณาติดต่อแอดมินร้านเพื่อเปิดสิทธิ์การใช้งาน",
    badgeClassName: "border-slate-300 bg-slate-50 text-slate-700",
  },
};

const normalizeStatus = (
  rawStatus: string | string[] | undefined,
): AccountStatus => {
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  if (status === "INVITED" || status === "SUSPENDED" || status === "NO_ACTIVE_STORE") {
    return status;
  }
  return "NO_ACTIVE_STORE";
};

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  const status = normalizeStatus(params.status);
  const content = statusContent[status];

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">SaaS POS</p>
        <h1 className="text-2xl font-semibold tracking-tight">ไม่สามารถเข้าใช้งานระบบ</h1>
        <p className="text-sm text-muted-foreground">
          เปลี่ยนรหัสผ่านสำเร็จแล้ว แต่บัญชีนี้ยังไม่สามารถเข้าใช้งานได้
        </p>
      </div>

      <div className={`rounded-xl border p-4 ${content.badgeClassName}`}>
        <p className="text-sm font-semibold">{content.title}</p>
        <p className="mt-2 text-sm">{content.description}</p>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลระบบของร้าน
      </div>

      <div className="flex justify-center">
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
