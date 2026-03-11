import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  getStorePaymentAccountQrImageMetaFromPostgres,
} from "@/lib/platform/postgres-store-settings";
import { hasPermission, RBACError, toRBACErrorResponse } from "@/lib/rbac/access";
import { resolvePaymentQrImageUrl } from "@/lib/storage/r2";

const extensionByContentType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const sanitizeFileName = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "qr-payment";
};

const extensionFromPath = (value: string) => {
  const match = value.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  return match?.[1]?.toLowerCase() ?? null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      throw new RBACError(401, "กรุณาเข้าสู่ระบบ");
    }

    const storeId = session.activeStoreId;
    if (!storeId) {
      throw new RBACError(400, "ยังไม่ได้เลือกร้านค้า");
    }

    const [canCreateOrders, canViewOrders] = await Promise.all([
      hasPermission({ userId: session.userId }, storeId, "orders.create"),
      hasPermission({ userId: session.userId }, storeId, "orders.view"),
    ]);

    if (!canCreateOrders && !canViewOrders) {
      throw new RBACError(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
    }

    const { accountId } = await context.params;
    const account = await getStorePaymentAccountQrImageMetaFromPostgres(storeId, accountId);

    if (!account) {
      return NextResponse.json({ message: "ไม่พบบัญชี QR" }, { status: 404 });
    }

    const imageUrl = resolvePaymentQrImageUrl(account.qrImageUrl ?? account.promptpayId ?? null);
    if (!imageUrl) {
      return NextResponse.json({ message: "บัญชีนี้ยังไม่มีรูป QR" }, { status: 404 });
    }

    const upstream = await fetch(imageUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ message: "โหลดรูป QR ไม่สำเร็จ" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type")?.trim() || "application/octet-stream";
    const urlObject = new URL(imageUrl);
    const extension =
      extensionByContentType[contentType] ?? extensionFromPath(urlObject.pathname) ?? "bin";
    const fileName = `${sanitizeFileName(account.displayName)}.${extension}`;
    const isDownload = new URL(request.url).searchParams.get("download") === "1";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
