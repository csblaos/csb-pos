import {
  canMemberAccessBranchInPostgres,
  ensureMainBranchExistsInPostgres,
  getMemberBranchAccessFromPostgres,
  listBranchesByStoreFromPostgres,
  replaceMemberBranchAccessInPostgres,
} from "@/lib/platform/postgres-branches";

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

export async function ensureMainBranchExists(storeId: string) {
  const postgresMainBranch = await ensureMainBranchExistsInPostgres(storeId);
  if (postgresMainBranch !== undefined) {
    return postgresMainBranch;
  }
  throw new Error("PostgreSQL branch bootstrap is not available");
}

export async function listStoreBranches(storeId: string): Promise<StoreBranchAccessItem[]> {
  const postgresBranches = await listBranchesByStoreFromPostgres(storeId);
  if (postgresBranches !== undefined) {
    return postgresBranches;
  }
  throw new Error("PostgreSQL branch listing is not available");
}

export async function getMemberBranchAccess(
  userId: string,
  storeId: string,
): Promise<BranchAccessSummary> {
  const postgresAccess = await getMemberBranchAccessFromPostgres(userId, storeId);
  if (postgresAccess !== undefined) {
    return postgresAccess;
  }
  throw new Error("PostgreSQL branch access lookup is not available");
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
  const postgresAccess = await canMemberAccessBranchInPostgres(userId, storeId, branchId);
  if (postgresAccess !== undefined) {
    return postgresAccess;
  }
  throw new Error("PostgreSQL branch access check is not available");
}

export async function replaceMemberBranchAccess(params: {
  userId: string;
  storeId: string;
  mode: MemberBranchAccessMode;
  branchIds: string[];
}) {
  const postgresResult = await replaceMemberBranchAccessInPostgres(params);
  if (postgresResult !== undefined) {
    return;
  }
  throw new Error("PostgreSQL branch access update is not available");
}
