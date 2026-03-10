import "./load-local-env.mjs";

import { randomUUID } from "node:crypto";

import { Sequelize } from "sequelize";

const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (value) => {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslrootcert");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
const rejectUnauthorized =
  (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

const sequelize = new Sequelize(sanitizeDatabaseUrl(databaseUrl), {
  dialect: "postgres",
  logging: false,
  dialectOptions: shouldUseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});

const getCancelScenario = (order, stockState) => {
  if (order.status === "READY_FOR_PICKUP") {
    return "RELEASE";
  }

  if (
    order.status === "PAID" ||
    order.status === "PACKED" ||
    order.status === "SHIPPED" ||
    order.status === "PICKED_UP_PENDING_PAYMENT"
  ) {
    return "RETURN";
  }

  if (order.status === "PENDING_PAYMENT") {
    if (!stockState.hasStockOutFromOrder && stockState.hasActiveReserve) {
      return "RELEASE";
    }

    if (stockState.hasStockOutFromOrder) {
      return "RETURN";
    }
  }

  return null;
};

try {
  await sequelize.authenticate();

  await sequelize.transaction(async (tx) => {
    const [orderRows] = await sequelize.query(
      `
        select
          o.id,
          o.store_id as "storeId",
          o.order_no as "orderNo",
          o.status,
          o.payment_status as "paymentStatus"
        from orders o
        where o.status <> 'CANCELLED'
          and exists (
            select 1
            from order_items oi
            where oi.order_id = o.id
          )
        order by o.created_at desc
        limit 20
      `,
      { transaction: tx },
    );

    const candidates = Array.isArray(orderRows) ? orderRows : [];
    let selectedOrder = null;
    let selectedScenario = null;

    for (const order of candidates) {
      const [stateRows] = await sequelize.query(
        `
          select
            coalesce(sum(case when type = 'RESERVE' then 1 else 0 end), 0) as "reserveCount",
            coalesce(sum(case when type = 'RELEASE' then 1 else 0 end), 0) as "releaseCount",
            coalesce(sum(case when type = 'OUT' then 1 else 0 end), 0) as "outCount"
          from inventory_movements
          where store_id = :storeId
            and ref_type = 'ORDER'
            and ref_id = :orderId
        `,
        {
          transaction: tx,
          replacements: {
            storeId: order.storeId,
            orderId: order.id,
          },
        },
      );

      const state = Array.isArray(stateRows) ? stateRows[0] : null;
      const scenario = getCancelScenario(order, {
        hasStockOutFromOrder: Number(state?.outCount ?? 0) > 0,
        hasActiveReserve: Number(state?.reserveCount ?? 0) > Number(state?.releaseCount ?? 0),
      });

      if (scenario) {
        selectedOrder = order;
        selectedScenario = scenario;
        break;
      }
    }

    if (!selectedOrder?.id || !selectedOrder?.storeId || !selectedOrder?.orderNo || !selectedScenario) {
      throw new Error("No eligible order found for cancel smoke test");
    }

    const [itemRows] = await sequelize.query(
      `
        select
          product_id as "productId",
          qty_base as "qtyBase"
        from order_items
        where order_id = :orderId
        order by id asc
      `,
      {
        transaction: tx,
        replacements: {
          orderId: selectedOrder.id,
        },
      },
    );

    const items = Array.isArray(itemRows) ? itemRows : [];
    if (items.length === 0) {
      throw new Error("No order items found for cancel smoke test");
    }

    if (selectedScenario === "RELEASE") {
      for (const item of items) {
        await sequelize.query(
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
              'RELEASE',
              :qtyBase,
              'ORDER',
              :orderId,
              :note,
              null
            )
          `,
          {
            transaction: tx,
            replacements: {
              id: randomUUID(),
              storeId: selectedOrder.storeId,
              productId: item.productId,
              qtyBase: item.qtyBase,
              orderId: selectedOrder.id,
              note: `smoke cancel release ${selectedOrder.orderNo}`,
            },
          },
        );
      }
    } else {
      for (const item of items) {
        await sequelize.query(
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
              'RETURN',
              :qtyBase,
              'RETURN',
              :orderId,
              :note,
              null
            )
          `,
          {
            transaction: tx,
            replacements: {
              id: randomUUID(),
              storeId: selectedOrder.storeId,
              productId: item.productId,
              qtyBase: item.qtyBase,
              orderId: selectedOrder.id,
              note: `smoke cancel return ${selectedOrder.orderNo}`,
            },
          },
        );
      }
    }

    const nextPaymentStatus =
      selectedOrder.paymentStatus === "PAID" || selectedOrder.paymentStatus === "COD_SETTLED"
        ? selectedOrder.paymentStatus
        : "FAILED";

    await sequelize.query(
      `
        update orders
        set
          status = 'CANCELLED',
          payment_status = :paymentStatus
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          orderId: selectedOrder.id,
          storeId: selectedOrder.storeId,
          paymentStatus: nextPaymentStatus,
        },
      },
    );

    await sequelize.query(
      `
        insert into audit_events (
          id,
          scope,
          store_id,
          action,
          entity_type,
          entity_id,
          result,
          metadata,
          occurred_at
        )
        values (
          :id,
          'STORE',
          :storeId,
          'order.cancel',
          'order',
          :orderId,
          'SUCCESS',
          cast(:metadata as jsonb),
          cast(current_timestamp as text)
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: selectedOrder.storeId,
          orderId: selectedOrder.id,
          metadata: JSON.stringify({
            smoke: true,
            scenario: selectedScenario,
            cancelReason: "smoke cancel",
            approvedByUserId: "smoke-approver",
            approvedByName: "Smoke Approver",
            approvedByEmail: "smoke@example.com",
            approvedByRole: "Manager",
            approvalMode: "MANAGER_PASSWORD",
            selfApproved: false,
            stockReleaseItems: selectedScenario === "RELEASE" ? items.length : 0,
            stockReturnItems: selectedScenario === "RETURN" ? items.length : 0,
          }),
        },
      },
    );

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:cancel] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:cancel] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
