import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

const updatePdfConfigSchema = z.object({
  pdfShowLogo: z.boolean().optional(),
  pdfShowSignature: z.boolean().optional(),
  pdfShowNote: z.boolean().optional(),
  pdfHeaderColor: z
    .string()
    .regex(hexColorPattern, "ต้องเป็นรหัสสี HEX เช่น #f1f5f9")
    .optional(),
  pdfCompanyName: z.union([z.string().max(200), z.null()]).optional(),
  pdfCompanyAddress: z.union([z.string().max(500), z.null()]).optional(),
  pdfCompanyPhone: z.union([z.string().max(30), z.null()]).optional(),
});

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");

    const [row] = await db
      .select({
        pdfShowLogo: stores.pdfShowLogo,
        pdfShowSignature: stores.pdfShowSignature,
        pdfShowNote: stores.pdfShowNote,
        pdfHeaderColor: stores.pdfHeaderColor,
        pdfCompanyName: stores.pdfCompanyName,
        pdfCompanyAddress: stores.pdfCompanyAddress,
        pdfCompanyPhone: stores.pdfCompanyPhone,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { message: "ไม่พบร้านค้า" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, config: row });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const action = "store.settings.pdf.update";
  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
  } | null = null;

  try {
    const { storeId, session } = await enforcePermission("settings.update");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };

    const body = await request.json();
    const parsed = updatePdfConfigSchema.safeParse(body);

    if (!parsed.success) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "store",
        entityId: storeId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    const d = parsed.data;

    if (d.pdfShowLogo !== undefined) updates.pdfShowLogo = d.pdfShowLogo;
    if (d.pdfShowSignature !== undefined) updates.pdfShowSignature = d.pdfShowSignature;
    if (d.pdfShowNote !== undefined) updates.pdfShowNote = d.pdfShowNote;
    if (d.pdfHeaderColor !== undefined) updates.pdfHeaderColor = d.pdfHeaderColor;
    if (d.pdfCompanyName !== undefined) updates.pdfCompanyName = d.pdfCompanyName;
    if (d.pdfCompanyAddress !== undefined) updates.pdfCompanyAddress = d.pdfCompanyAddress;
    if (d.pdfCompanyPhone !== undefined) updates.pdfCompanyPhone = d.pdfCompanyPhone;

    if (Object.keys(updates).length === 0) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "store",
        entityId: storeId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          message: "no_update_fields",
        },
        request,
      });
      return NextResponse.json(
        { message: "ไม่มีข้อมูลสำหรับอัปเดต" },
        { status: 400 },
      );
    }

    const [before] = await db
      .select({
        pdfShowLogo: stores.pdfShowLogo,
        pdfShowSignature: stores.pdfShowSignature,
        pdfShowNote: stores.pdfShowNote,
        pdfHeaderColor: stores.pdfHeaderColor,
        pdfCompanyName: stores.pdfCompanyName,
        pdfCompanyAddress: stores.pdfCompanyAddress,
        pdfCompanyPhone: stores.pdfCompanyPhone,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!before) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "store",
        entityId: storeId,
        result: "FAIL",
        reasonCode: "NOT_FOUND",
        request,
      });
      return NextResponse.json({ message: "ไม่พบร้านค้า" }, { status: 404 });
    }

    await db
      .update(stores)
      .set(updates)
      .where(eq(stores.id, storeId));

    const [updated] = await db
      .select({
        pdfShowLogo: stores.pdfShowLogo,
        pdfShowSignature: stores.pdfShowSignature,
        pdfShowNote: stores.pdfShowNote,
        pdfHeaderColor: stores.pdfHeaderColor,
        pdfCompanyName: stores.pdfCompanyName,
        pdfCompanyAddress: stores.pdfCompanyAddress,
        pdfCompanyPhone: stores.pdfCompanyPhone,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action,
      entityType: "store",
      entityId: storeId,
      metadata: {
        fields: Object.keys(updates),
      },
      before,
      after: updated,
      request,
    });

    return NextResponse.json({ ok: true, config: updated });
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action,
        entityType: "store",
        entityId: auditContext.storeId,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}
