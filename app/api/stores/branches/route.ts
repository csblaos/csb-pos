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
import {
  ensureMainBranchExists,
  listAccessibleBranchesForMember,
} from "@/lib/branches/access";
import { db } from "@/lib/db/client";
import { storeBranches } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const createBranchSharingModeSchema = z.enum([
  "BALANCED",
  "FULL_SYNC",
  "INDEPENDENT",
]);

const branchSharingConfigSchema = z.object({
  shareCatalog: z.boolean(),
  sharePricing: z.boolean(),
  sharePromotions: z.boolean(),
  shareCustomers: z.boolean(),
  shareStaffRoles: z.boolean(),
  shareInventory: z.boolean(),
});

const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(40).nullable().optional(),
  address: z.string().trim().min(1).max(240).nullable().optional(),
  sourceBranchId: z.string().trim().min(1).nullable().optional(),
  sharingMode: createBranchSharingModeSchema.optional(),
  sharingConfig: branchSharingConfigSchema.optional(),
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

type BranchSharingMode = "MAIN" | z.infer<typeof createBranchSharingModeSchema>;
type BranchSharingConfig = z.infer<typeof branchSharingConfigSchema>;

const sharingDefaultsByMode: Record<Exclude<BranchSharingMode, "MAIN">, BranchSharingConfig> = {
  BALANCED: {
    shareCatalog: true,
    sharePricing: true,
    sharePromotions: true,
    shareCustomers: true,
    shareStaffRoles: true,
    shareInventory: false,
  },
  FULL_SYNC: {
    shareCatalog: true,
    sharePricing: true,
    sharePromotions: true,
    shareCustomers: true,
    shareStaffRoles: true,
    shareInventory: true,
  },
  INDEPENDENT: {
    shareCatalog: false,
    sharePricing: false,
    sharePromotions: false,
    shareCustomers: false,
    shareStaffRoles: false,
    shareInventory: false,
  },
};

const parseSharingConfig = (
  mode: BranchSharingMode,
  raw: string | null | undefined,
): BranchSharingConfig | null => {
  if (mode === "MAIN") {
    return null;
  }

  if (!raw) {
    return sharingDefaultsByMode[mode];
  }

  try {
    const parsed = branchSharingConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return sharingDefaultsByMode[mode];
    }
    return parsed.data;
  } catch {
    return sharingDefaultsByMode[mode];
  }
};

const toBranchResponse = (
  branches: Array<{
    id: string;
    storeId: string;
    name: string;
    code: string | null;
    address: string | null;
    sourceBranchId: string | null;
    sharingMode: string | null;
    sharingConfig: string | null;
    createdAt: string;
  }>,
) => {
  const nameById = new Map(branches.map((branch) => [branch.id, branch.name]));

  return branches.map((branch) => {
    const mode: BranchSharingMode =
      branch.code === "MAIN"
        ? "MAIN"
        : createBranchSharingModeSchema.safeParse(branch.sharingMode).success
          ? (branch.sharingMode as z.infer<typeof createBranchSharingModeSchema>)
          : "BALANCED";

    return {
      ...branch,
      sharingMode: mode,
      sharingConfig: parseSharingConfig(mode, branch.sharingConfig),
      sourceBranchName: branch.sourceBranchId ? (nameById.get(branch.sourceBranchId) ?? null) : null,
    };
  });
};

export async function GET() {
  try {
    const { session, storeId } = await enforcePermission("stores.view");
    await ensureMainBranchExists(storeId);

    const [branches, policy, accessibleBranches] = await Promise.all([
      listBranchesByStore(storeId),
      getBranchCreationPolicy(session.userId, storeId),
      listAccessibleBranchesForMember(session.userId, storeId),
    ]);
    const allowSet = new Set(accessibleBranches.map((branch) => branch.id));
    const branchRows = toBranchResponse(branches).map((branch) => ({
      ...branch,
      canAccess: allowSet.has(branch.id),
    }));

    return NextResponse.json({
      ok: true,
      branches: branchRows,
      branchAccessMode:
        allowSet.size === branchRows.length ? "ALL" : "SELECTED",
      policy: toBranchPolicyResponse(policy),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, storeId } = await enforcePermission("stores.update");
    const mainBranch = await ensureMainBranchExists(storeId);

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

    const sharingMode = payload.data.sharingMode ?? "BALANCED";
    const sharingConfig = payload.data.sharingConfig ?? sharingDefaultsByMode[sharingMode];
    const requestedSourceBranchId = payload.data.sourceBranchId?.trim() || null;

    let sourceBranchId = requestedSourceBranchId;
    if (sharingMode === "INDEPENDENT") {
      sourceBranchId = null;
    } else if (!sourceBranchId) {
      sourceBranchId = mainBranch.id;
    }

    if (sourceBranchId) {
      const [sourceBranch] = await db
        .select({ id: storeBranches.id })
        .from(storeBranches)
        .where(and(eq(storeBranches.storeId, storeId), eq(storeBranches.id, sourceBranchId)))
        .limit(1);

      if (!sourceBranch) {
        return NextResponse.json(
          { message: "ไม่พบสาขาต้นทางสำหรับคัดลอกการตั้งค่า" },
          { status: 404 },
        );
      }
    }

    await db.insert(storeBranches).values({
      id: randomUUID(),
      storeId,
      name: payload.data.name,
      code: normalizedCode,
      address: payload.data.address?.trim() || null,
      sourceBranchId,
      sharingMode,
      sharingConfig: JSON.stringify(sharingConfig),
    });

    const [branches, refreshedPolicy] = await Promise.all([
      listBranchesByStore(storeId),
      getBranchCreationPolicy(session.userId, storeId),
    ]);

    return NextResponse.json({
      ok: true,
      branches: toBranchResponse(branches),
      policy: toBranchPolicyResponse(refreshedPolicy),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
