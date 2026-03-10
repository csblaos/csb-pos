import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import type { RequestContext } from "@/lib/http/request-context";
import { buildAuditEventValues } from "@/server/services/audit.service";

type CreateStockMovementInPostgresInput = {
  storeId: string;
  productId: string;
  type: "IN" | "ADJUST" | "RETURN";
  qtyBase: number;
  note: string | null;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  qty: number;
  unitId: string;
  adjustMode?: "INCREASE" | "DECREASE";
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type StockBalanceRow = {
  onHand: number | string | null;
  reserved: number | string | null;
};

export const isPostgresStockMovementWriteEnabled = () =>
  process.env.POSTGRES_STOCK_WRITE_MOVEMENT_ENABLED === "1" && isPostgresConfigured();

const loadStockBalanceInPostgres = async (storeId: string, productId: string) => {
  const row = await queryOne<StockBalanceRow>(
    `
      select
        coalesce(sum(case
          when type = 'IN' then qty_base
          when type = 'RETURN' then qty_base
          when type = 'OUT' then -qty_base
          when type = 'ADJUST' then qty_base
          else 0
        end), 0) as "onHand",
        coalesce(sum(case
          when type = 'RESERVE' then qty_base
          when type = 'RELEASE' then -qty_base
          else 0
        end), 0) as "reserved"
      from inventory_movements
      where store_id = :storeId
        and product_id = :productId
    `,
    {
      replacements: {
        storeId,
        productId,
      },
    },
  );

  const onHand = Number(row?.onHand ?? 0);
  const reserved = Number(row?.reserved ?? 0);

  return {
    productId,
    onHand,
    reserved,
    available: onHand - reserved,
  };
};

export const createStockMovementInPostgres = async (
  input: CreateStockMovementInPostgresInput,
) => {
  const movementId = randomUUID();

  await runInTransaction(async (tx) => {
    await execute(
      `
        insert into inventory_movements (
          id,
          store_id,
          product_id,
          type,
          qty_base,
          ref_type,
          ref_id,
          note,
          created_by
        )
        values (
          :id,
          :storeId,
          :productId,
          :type,
          :qtyBase,
          :refType,
          null,
          :note,
          :createdBy
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: movementId,
          storeId: input.storeId,
          productId: input.productId,
          type: input.type,
          qtyBase: input.qtyBase,
          refType: input.type === "RETURN" ? "RETURN" : "MANUAL",
          note: input.note,
          createdBy: input.actorUserId,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "stock.movement.create",
      entityType: "inventory_movement",
      entityId: movementId,
      metadata: {
        movementType: input.type,
        productId: input.productId,
        qty: input.qty,
        unitId: input.unitId,
        adjustMode: input.adjustMode ?? null,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await execute(
      `
        insert into audit_events (
          id,
          scope,
          store_id,
          actor_user_id,
          actor_name,
          actor_role,
          action,
          entity_type,
          entity_id,
          result,
          reason_code,
          ip_address,
          user_agent,
          request_id,
          metadata,
          before,
          after,
          occurred_at
        )
        values (
          :id,
          :scope,
          :storeId,
          :actorUserId,
          :actorName,
          :actorRole,
          :action,
          :entityType,
          :entityId,
          :result,
          :reasonCode,
          :ipAddress,
          :userAgent,
          :requestId,
          cast(:metadata as jsonb),
          cast(:before as jsonb),
          cast(:after as jsonb),
          :occurredAt
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          scope: auditValues.scope,
          storeId: auditValues.storeId,
          actorUserId: auditValues.actorUserId,
          actorName: auditValues.actorName,
          actorRole: auditValues.actorRole,
          action: auditValues.action,
          entityType: auditValues.entityType,
          entityId: auditValues.entityId,
          result: auditValues.result,
          reasonCode: auditValues.reasonCode,
          ipAddress: auditValues.ipAddress,
          userAgent: auditValues.userAgent,
          requestId: auditValues.requestId,
          metadata: auditValues.metadata,
          before: auditValues.before,
          after: auditValues.after,
          occurredAt: auditValues.occurredAt,
        },
      },
    );
  });

  const balance = await loadStockBalanceInPostgres(input.storeId, input.productId);
  return { movementId, balance };
};
