import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  isOrderShippingLabelR2Configured,
  uploadOrderShippingLabelToR2,
} from "@/lib/storage/r2";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const SHIPPING_LABEL_UPLOAD_ACTION = "order.upload_shipping_label_image";
const SHIPPING_LABEL_MAX_SIZE_MB = 6;

type UploadAuditContext = {
  storeId: string;
  userId: string;
  actorName: string | null;
  actorRole: string | null;
  orderId: string;
};

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    size?: unknown;
    type?: unknown;
    arrayBuffer?: unknown;
  };

  return (
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function toUploadErrorResponse(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNSUPPORTED_FILE_TYPE") {
      return NextResponse.json({ message: "รองรับเฉพาะไฟล์รูปภาพ" }, { status: 400 });
    }

    if (error.message === "FILE_TOO_LARGE") {
      return NextResponse.json(
        {
          message: `ไฟล์รูปใหญ่เกินกำหนด (ไม่เกิน ${SHIPPING_LABEL_MAX_SIZE_MB}MB)`,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ message: "อัปโหลดรูปบิล/ป้ายจัดส่งไม่สำเร็จ" }, { status: 500 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  let auditContext: UploadAuditContext | null = null;

  try {
    const { session, storeId } = await enforcePermission("orders.update");
    const { orderId } = await context.params;
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      orderId,
    };

    if (!isOrderShippingLabelR2Configured()) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "R2_NOT_CONFIGURED",
        request,
      });

      return NextResponse.json(
        { message: "ยังไม่ได้ตั้งค่า R2 สำหรับรูปบิลจัดส่ง" },
        { status: 500 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "UNSUPPORTED_MEDIA_TYPE",
        request,
      });

      return NextResponse.json(
        { message: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาอัปโหลดไฟล์รูปภาพ" },
        { status: 415 },
      );
    }

    const [targetOrder] = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
      .limit(1);

    if (!targetOrder) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "ORDER_NOT_FOUND",
        request,
      });
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 404 });
    }

    if (targetOrder.status === "CANCELLED") {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "ORDER_ALREADY_CANCELLED",
        metadata: {
          orderNo: targetOrder.orderNo,
          status: targetOrder.status,
        },
        request,
      });
      return NextResponse.json({ message: "ไม่สามารถอัปโหลดให้กับออเดอร์ที่ยกเลิกแล้ว" }, { status: 400 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("image");
    const sourceValue = formData.get("source");
    const source =
      typeof sourceValue === "string" && (sourceValue === "camera" || sourceValue === "file")
        ? sourceValue
        : "file";

    if (!isFileLike(fileValue) || fileValue.size <= 0) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode: "FILE_MISSING",
        metadata: { source },
        request,
      });
      return NextResponse.json({ message: "กรุณาเลือกไฟล์รูปภาพ" }, { status: 400 });
    }

    const upload = await uploadOrderShippingLabelToR2({
      storeId,
      orderNo: targetOrder.orderNo,
      file: fileValue,
    });

    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: SHIPPING_LABEL_UPLOAD_ACTION,
      entityType: "order",
      entityId: orderId,
      metadata: {
        orderNo: targetOrder.orderNo,
        source,
        fileType: fileValue.type || null,
        fileSize: fileValue.size,
        labelUrl: upload.url,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      labelUrl: upload.url,
      source,
    });
  } catch (error) {
    const failReasonCode =
      error instanceof Error && error.message === "UNSUPPORTED_FILE_TYPE"
        ? "UNSUPPORTED_FILE_TYPE"
        : error instanceof Error && error.message === "FILE_TOO_LARGE"
          ? "FILE_TOO_LARGE"
          : "INTERNAL_ERROR";

    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: SHIPPING_LABEL_UPLOAD_ACTION,
        entityType: "order",
        entityId: auditContext.orderId,
        result: "FAIL",
        reasonCode: failReasonCode,
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }

    const uploadErrorResponse = toUploadErrorResponse(error);
    if (uploadErrorResponse.status !== 500) {
      return uploadErrorResponse;
    }
    return toRBACErrorResponse(error);
  }
}
