import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  evaluateBranchCreationAccess,
  formatBranchQuotaSummary,
  getBranchCreationPolicy,
  listBranchesByStore,
} from "@/lib/branches/policy";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { storeBranches } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(40).nullable().optional(),
  address: z.string().trim().min(1).max(240).nullable().optional(),
});

const toBranchPolicyResponse = (policy: Awaited<ReturnType<typeof getBranchCreationPolicy>>) => ({
  isSuperadmin: policy.isSuperadmin,
  isStoreOwner: policy.isStoreOwner,
  effectiveCanCreateBranches: policy.effectiveCanCreateBranches,
  effectiveMaxBranchesPerStore: policy.effectiveMaxBranchesPerStore,
  effectiveLimitSource: policy.effectiveLimitSource,
  currentBranchCount: policy.currentBranchCount,
  storeMaxBranchesOverride: policy.storeMaxBranchesOverride,
  summary: formatBranchQuotaSummary(policy),
});

export async function GET() {
  try {
    const { session, storeId } = await enforcePermission("stores.view");

    const [branches, policy] = await Promise.all([
      listBranchesByStore(storeId),
      getBranchCreationPolicy(session.userId, storeId),
    ]);

    return NextResponse.json({
      ok: true,
      branches,
      policy: toBranchPolicyResponse(policy),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, storeId } = await enforcePermission("stores.update");

    const payload = createBranchSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลสาขาไม่ถูกต้อง" }, { status: 400 });
    }

    const systemRole = await getUserSystemRole(session.userId);
    if (systemRole !== "SUPERADMIN") {
      return NextResponse.json(
        { message: "เฉพาะบัญชี SUPERADMIN เท่านั้นที่สร้างสาขาได้" },
        { status: 403 },
      );
    }

    const policy = await getBranchCreationPolicy(session.userId, storeId);
    const access = evaluateBranchCreationAccess(policy);
    if (!access.allowed) {
      return NextResponse.json(
        { message: access.reason ?? "ไม่สามารถสร้างสาขาเพิ่มได้" },
        { status: 403 },
      );
    }

    const [sameName] = await db
      .select({ id: storeBranches.id })
      .from(storeBranches)
      .where(
        and(
          eq(storeBranches.storeId, storeId),
          eq(storeBranches.name, payload.data.name),
        ),
      )
      .limit(1);

    if (sameName) {
      return NextResponse.json({ message: "มีชื่อสาขานี้อยู่แล้ว" }, { status: 409 });
    }

    const normalizedCode = payload.data.code?.trim() || null;
    if (normalizedCode) {
      const [sameCode] = await db
        .select({ id: storeBranches.id })
        .from(storeBranches)
        .where(
          and(
            eq(storeBranches.storeId, storeId),
            eq(storeBranches.code, normalizedCode),
          ),
        )
        .limit(1);

      if (sameCode) {
        return NextResponse.json({ message: "รหัสสาขานี้ถูกใช้งานแล้ว" }, { status: 409 });
      }
    }

    await db.insert(storeBranches).values({
      id: randomUUID(),
      storeId,
      name: payload.data.name,
      code: normalizedCode,
      address: payload.data.address?.trim() || null,
    });

    const [branches, refreshedPolicy] = await Promise.all([
      listBranchesByStore(storeId),
      getBranchCreationPolicy(session.userId, storeId),
    ]);

    return NextResponse.json({
      ok: true,
      branches,
      policy: toBranchPolicyResponse(refreshedPolicy),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
