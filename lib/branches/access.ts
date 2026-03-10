import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { storeBranches, storeMemberBranches } from "@/lib/db/schema";
import {
  ensureMainBranchExistsInPostgres,
  getMemberBranchAccessFromPostgres,
  listStoreBranchesFromPostgres,
  logAuthRbacReadFallback,
} from "@/lib/platform/postgres-auth-rbac";

export type MemberBranchAccessMode = "ALL" | "SELECTED";

export type BranchAccessSummary = {
  mode: MemberBranchAccessMode;
  branchIds: string[];
};

export type StoreBranchAccessItem = {
  id: string;
  storeId: string;
  name: string;
  code: string | null;
  address: string | null;
  createdAt: string;
};

const getTursoDb = async () => (await import("@/lib/db/client")).db;

export async function ensureMainBranchExists(storeId: string) {
  try {
    const postgresMainBranch = await ensureMainBranchExistsInPostgres(storeId);
    if (postgresMainBranch !== undefined) {
      return postgresMainBranch;
    }
  } catch (error) {
    logAuthRbacReadFallback("branches.ensure-main", error);
  }

  const db = await getTursoDb();
  const [mainBranch] = await db
    .select({
      id: storeBranches.id,
      storeId: storeBranches.storeId,
      name: storeBranches.name,
      code: storeBranches.code,
      address: storeBranches.address,
      createdAt: storeBranches.createdAt,
    })
    .from(storeBranches)
    .where(and(eq(storeBranches.storeId, storeId), eq(storeBranches.code, "MAIN")))
    .limit(1);

  if (mainBranch) {
    return mainBranch;
  }

  await db
    .insert(storeBranches)
    .values({
      id: randomUUID(),
      storeId,
      name: "สาขาหลัก",
      code: "MAIN",
      address: null,
      sourceBranchId: null,
      sharingMode: "MAIN",
      sharingConfig: null,
    })
    .onConflictDoNothing();

  const [createdMainBranch] = await db
    .select({
      id: storeBranches.id,
      storeId: storeBranches.storeId,
      name: storeBranches.name,
      code: storeBranches.code,
      address: storeBranches.address,
      createdAt: storeBranches.createdAt,
    })
    .from(storeBranches)
    .where(and(eq(storeBranches.storeId, storeId), eq(storeBranches.code, "MAIN")))
    .limit(1);

  if (createdMainBranch) {
    return createdMainBranch;
  }

  throw new Error("ไม่สามารถสร้างสาขาหลักได้");
}

export async function listStoreBranches(storeId: string): Promise<StoreBranchAccessItem[]> {
  try {
    const postgresBranches = await listStoreBranchesFromPostgres(storeId);
    if (postgresBranches !== undefined) {
      return postgresBranches;
    }
  } catch (error) {
    logAuthRbacReadFallback("branches.list", error);
  }

  const db = await getTursoDb();
  return db
    .select({
      id: storeBranches.id,
      storeId: storeBranches.storeId,
      name: storeBranches.name,
      code: storeBranches.code,
      address: storeBranches.address,
      createdAt: storeBranches.createdAt,
    })
    .from(storeBranches)
    .where(eq(storeBranches.storeId, storeId))
    .orderBy(storeBranches.createdAt, storeBranches.name);
}

export async function getMemberBranchAccess(
  userId: string,
  storeId: string,
): Promise<BranchAccessSummary> {
  try {
    const postgresAccess = await getMemberBranchAccessFromPostgres(userId, storeId);
    if (postgresAccess !== undefined) {
      return postgresAccess;
    }
  } catch (error) {
    logAuthRbacReadFallback("branches.member-access", error);
  }

  const db = await getTursoDb();
  const rows = await db
    .select({ branchId: storeMemberBranches.branchId })
    .from(storeMemberBranches)
    .where(
      and(
        eq(storeMemberBranches.storeId, storeId),
        eq(storeMemberBranches.userId, userId),
      ),
    );

  const branchIds = rows.map((row) => row.branchId);
  if (branchIds.length === 0) {
    return { mode: "ALL", branchIds: [] };
  }

  return { mode: "SELECTED", branchIds };
}

export async function listAccessibleBranchesForMember(
  userId: string,
  storeId: string,
): Promise<StoreBranchAccessItem[]> {
  await ensureMainBranchExists(storeId);

  const [allBranches, access] = await Promise.all([
    listStoreBranches(storeId),
    getMemberBranchAccess(userId, storeId),
  ]);

  if (access.mode === "ALL") {
    return allBranches;
  }

  const allowSet = new Set(access.branchIds);
  const filtered = allBranches.filter((branch) => allowSet.has(branch.id));
  if (filtered.length > 0) {
    return filtered;
  }

  const fallbackBranch = allBranches.find((branch) => branch.code === "MAIN") ?? allBranches[0];
  if (!fallbackBranch) {
    return [];
  }

  await replaceMemberBranchAccess({
    userId,
    storeId,
    mode: "SELECTED",
    branchIds: [fallbackBranch.id],
  });

  return [fallbackBranch];
}

export async function canMemberAccessBranch(
  userId: string,
  storeId: string,
  branchId: string,
) {
  const db = await getTursoDb();
  const [targetBranch, accessibleBranches] = await Promise.all([
    db
      .select({ id: storeBranches.id })
      .from(storeBranches)
      .where(and(eq(storeBranches.storeId, storeId), eq(storeBranches.id, branchId)))
      .limit(1),
    listAccessibleBranchesForMember(userId, storeId),
  ]);

  if (!targetBranch[0]) {
    return false;
  }

  return accessibleBranches.some((branch) => branch.id === branchId);
}

export async function replaceMemberBranchAccess(params: {
  userId: string;
  storeId: string;
  mode: MemberBranchAccessMode;
  branchIds: string[];
}) {
  const db = await getTursoDb();
  if (params.mode === "ALL") {
    await db
      .delete(storeMemberBranches)
      .where(
        and(
          eq(storeMemberBranches.storeId, params.storeId),
          eq(storeMemberBranches.userId, params.userId),
        ),
      );
    return;
  }

  const dedupedBranchIds = [...new Set(params.branchIds.map((id) => id.trim()).filter(Boolean))];
  if (dedupedBranchIds.length === 0) {
    throw new Error("REQUIRE_BRANCH_SELECTION");
  }

  const branchRows = await db
    .select({ id: storeBranches.id })
    .from(storeBranches)
    .where(
      and(
        eq(storeBranches.storeId, params.storeId),
        inArray(storeBranches.id, dedupedBranchIds),
      ),
    );

  if (branchRows.length !== dedupedBranchIds.length) {
    throw new Error("INVALID_BRANCH_SELECTION");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(storeMemberBranches)
      .where(
        and(
          eq(storeMemberBranches.storeId, params.storeId),
          eq(storeMemberBranches.userId, params.userId),
        ),
      );

    await tx.insert(storeMemberBranches).values(
      dedupedBranchIds.map((branchId) => ({
        storeId: params.storeId,
        userId: params.userId,
        branchId,
      })),
    );
  });
}
