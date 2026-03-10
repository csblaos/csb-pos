import "./load-local-env.mjs";

import { createClient } from "@libsql/client";
import { Sequelize } from "sequelize";

const sourceDatabaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const sourceAuthToken = process.env.TURSO_AUTH_TOKEN;
const targetDatabaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!targetDatabaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (databaseUrl) => {
  const trimmed = databaseUrl.trim();

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

const source = createClient({
  url: sourceDatabaseUrl,
  authToken: sourceAuthToken,
});

const target = new Sequelize(sanitizeDatabaseUrl(targetDatabaseUrl), {
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

const REPORTS_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const PAID_STATUSES = ["PAID", "PACKED", "SHIPPED"];

const getReportDateBounds = () => {
  const now = new Date();
  const shifted = new Date(now.getTime() + REPORTS_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const date = shifted.getUTCDate();

  return {
    todayStartUtc: new Date(Date.UTC(year, month, date) - REPORTS_UTC_OFFSET_MS).toISOString(),
    tomorrowStartUtc: new Date(
      Date.UTC(year, month, date + 1) - REPORTS_UTC_OFFSET_MS,
    ).toISOString(),
    monthStartUtc: new Date(Date.UTC(year, month, 1) - REPORTS_UTC_OFFSET_MS).toISOString(),
  };
};

const fetchSourceRows = async (sql, args = []) => {
  const result = await source.execute({ sql, args });
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql, replacements = {}) => {
  const [rows] = await target.query(sql, { replacements });
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const normalizeScalar = (value) => {
  if (typeof value === "number") {
    return Number(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  return value;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }

  return normalizeScalar(value);
};

const asComparableJson = (value) => JSON.stringify(normalizeValue(value));

const toNumber = (value) => Number(value ?? 0);

const sortTopProducts = (rows) =>
  [...rows].sort(
    (a, b) =>
      Number(b.revenue) - Number(a.revenue) ||
      Number(b.qtyBaseSold) - Number(a.qtyBaseSold) ||
      String(a.productId).localeCompare(String(b.productId)),
  );

const sortSalesByChannel = (rows) =>
  [...rows].sort((a, b) => String(a.channel).localeCompare(String(b.channel)));

const sortCodByProvider = (rows) =>
  [...rows].sort((a, b) => String(a.provider).localeCompare(String(b.provider)));

const sortRecentLocks = (rows) =>
  [...rows].sort(
    (a, b) =>
      String(b.exchangeRateLockedAt ?? "").localeCompare(String(a.exchangeRateLockedAt ?? "")) ||
      String(a.id).localeCompare(String(b.id)),
  );

const sortSuppliers = (rows) =>
  [...rows].sort(
    (a, b) =>
      Number(b.outstandingBase) - Number(a.outstandingBase) ||
      String(a.supplierName).localeCompare(String(b.supplierName)),
  );

const sortOutstandingRows = (rows) =>
  [...rows].sort(
    (a, b) =>
      String(b.dueDate ?? "").localeCompare(String(a.dueDate ?? "")) ||
      String(b.receivedAt ?? "").localeCompare(String(a.receivedAt ?? "")) ||
      String(a.poId).localeCompare(String(b.poId)),
  );

const getStoreIds = async () => {
  const rows = await fetchSourceRows(`
    select distinct store_id as "storeId"
    from (
      select store_id from orders
      union
      select store_id from purchase_orders
    ) stores_used
    order by store_id asc
  `);
  return rows.map((row) => String(row.storeId));
};

const getStoreCurrencyMap = async () => {
  const rows = await fetchSourceRows(`
    select id, currency
    from stores
    order by id asc
  `);

  return new Map(rows.map((row) => [String(row.id), String(row.currency ?? "LAK")]));
};

const fetchSourceSalesSummary = async (storeId, bounds) => {
  const [todayRow] = await fetchSourceRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = ?
        and status in (${PAID_STATUSES.map(() => "?").join(", ")})
        and paid_at >= ?
        and paid_at < ?
    `,
    [storeId, ...PAID_STATUSES, bounds.todayStartUtc, bounds.tomorrowStartUtc],
  );
  const [monthRow] = await fetchSourceRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = ?
        and status in (${PAID_STATUSES.map(() => "?").join(", ")})
        and paid_at >= ?
        and paid_at < ?
    `,
    [storeId, ...PAID_STATUSES, bounds.monthStartUtc, bounds.tomorrowStartUtc],
  );

  return {
    salesToday: toNumber(todayRow?.value),
    salesThisMonth: toNumber(monthRow?.value),
  };
};

const fetchTargetSalesSummary = async (storeId, bounds) => {
  const [todayRow] = await fetchTargetRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = :storeId
        and status in ('PAID', 'PACKED', 'SHIPPED')
        and paid_at >= :todayStartUtc
        and paid_at < :tomorrowStartUtc
    `,
    {
      storeId,
      todayStartUtc: bounds.todayStartUtc,
      tomorrowStartUtc: bounds.tomorrowStartUtc,
    },
  );
  const [monthRow] = await fetchTargetRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = :storeId
        and status in ('PAID', 'PACKED', 'SHIPPED')
        and paid_at >= :monthStartUtc
        and paid_at < :tomorrowStartUtc
    `,
    {
      storeId,
      monthStartUtc: bounds.monthStartUtc,
      tomorrowStartUtc: bounds.tomorrowStartUtc,
    },
  );

  return {
    salesToday: toNumber(todayRow?.value),
    salesThisMonth: toNumber(monthRow?.value),
  };
};

const fetchSourceTopProducts = async (storeId) => {
  const rows = await fetchSourceRows(
    `
      select
        p.id as "productId",
        p.sku as "sku",
        p.name as "name",
        coalesce(sum(oi.qty_base), 0) as "qtyBaseSold",
        coalesce(sum(oi.line_total), 0) as "revenue",
        coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as "cogs"
      from order_items oi
      inner join orders o on oi.order_id = o.id
      inner join products p on oi.product_id = p.id
      where o.store_id = ?
        and o.status in (${PAID_STATUSES.map(() => "?").join(", ")})
      group by p.id, p.sku, p.name
      order by coalesce(sum(oi.line_total), 0) desc
      limit 10
    `,
    [storeId, ...PAID_STATUSES],
  );

  return sortTopProducts(
    rows.map((row) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      qtyBaseSold: toNumber(row.qtyBaseSold),
      revenue: toNumber(row.revenue),
      cogs: toNumber(row.cogs),
    })),
  );
};

const fetchTargetTopProducts = async (storeId) => {
  const rows = await fetchTargetRows(
    `
      select
        p.id as "productId",
        p.sku as "sku",
        p.name as "name",
        coalesce(sum(oi.qty_base), 0) as "qtyBaseSold",
        coalesce(sum(oi.line_total), 0) as "revenue",
        coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as "cogs"
      from order_items oi
      inner join orders o on oi.order_id = o.id
      inner join products p on oi.product_id = p.id
      where o.store_id = :storeId
        and o.status in ('PAID', 'PACKED', 'SHIPPED')
      group by p.id, p.sku, p.name
      order by coalesce(sum(oi.line_total), 0) desc
      limit 10
    `,
    { storeId },
  );

  return sortTopProducts(
    rows.map((row) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      qtyBaseSold: toNumber(row.qtyBaseSold),
      revenue: toNumber(row.revenue),
      cogs: toNumber(row.cogs),
    })),
  );
};

const fetchSourceSalesByChannel = async (storeId) => {
  const rows = await fetchSourceRows(
    `
      select
        channel,
        count(*) as "orderCount",
        coalesce(sum(total), 0) as "salesTotal"
      from orders
      where store_id = ?
        and status in (${PAID_STATUSES.map(() => "?").join(", ")})
      group by channel
      order by coalesce(sum(total), 0) desc
    `,
    [storeId, ...PAID_STATUSES],
  );

  return sortSalesByChannel(
    rows.map((row) => ({
      channel: row.channel,
      orderCount: toNumber(row.orderCount),
      salesTotal: toNumber(row.salesTotal),
    })),
  );
};

const fetchTargetSalesByChannel = async (storeId) => {
  const rows = await fetchTargetRows(
    `
      select
        channel,
        count(*) as "orderCount",
        coalesce(sum(total), 0) as "salesTotal"
      from orders
      where store_id = :storeId
        and status in ('PAID', 'PACKED', 'SHIPPED')
      group by channel
      order by coalesce(sum(total), 0) desc
    `,
    { storeId },
  );

  return sortSalesByChannel(
    rows.map((row) => ({
      channel: row.channel,
      orderCount: toNumber(row.orderCount),
      salesTotal: toNumber(row.salesTotal),
    })),
  );
};

const fetchSourceGrossProfit = async (storeId) => {
  const [revenueRow] = await fetchSourceRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = ?
        and status in (${PAID_STATUSES.map(() => "?").join(", ")})
    `,
    [storeId, ...PAID_STATUSES],
  );
  const [cogsRow] = await fetchSourceRows(
    `
      select coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as value
      from order_items oi
      inner join orders o on oi.order_id = o.id
      where o.store_id = ?
        and o.status in (${PAID_STATUSES.map(() => "?").join(", ")})
    `,
    [storeId, ...PAID_STATUSES],
  );
  const [currentCostRow] = await fetchSourceRows(
    `
      select coalesce(sum(oi.qty_base * p.cost_base), 0) as value
      from order_items oi
      inner join orders o on oi.order_id = o.id
      inner join products p on oi.product_id = p.id
      where o.store_id = ?
        and o.status in (${PAID_STATUSES.map(() => "?").join(", ")})
    `,
    [storeId, ...PAID_STATUSES],
  );
  const [shippingRow] = await fetchSourceRows(
    `
      select coalesce(sum(shipping_cost), 0) as value
      from orders
      where store_id = ?
        and status in (${PAID_STATUSES.map(() => "?").join(", ")})
    `,
    [storeId, ...PAID_STATUSES],
  );

  const revenue = toNumber(revenueRow?.value);
  const cogs = toNumber(cogsRow?.value);
  const currentCostCogs = toNumber(currentCostRow?.value);
  const shippingCost = toNumber(shippingRow?.value);
  const grossProfit = revenue - cogs - shippingCost;
  const currentCostGrossProfit = revenue - currentCostCogs - shippingCost;

  return {
    revenue,
    cogs,
    currentCostCogs,
    shippingCost,
    grossProfit,
    currentCostGrossProfit,
    grossProfitDeltaVsCurrentCost: grossProfit - currentCostGrossProfit,
  };
};

const fetchTargetGrossProfit = async (storeId) => {
  const [revenueRow] = await fetchTargetRows(
    `
      select coalesce(sum(total), 0) as value
      from orders
      where store_id = :storeId
        and status in ('PAID', 'PACKED', 'SHIPPED')
    `,
    { storeId },
  );
  const [cogsRow] = await fetchTargetRows(
    `
      select coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as value
      from order_items oi
      inner join orders o on oi.order_id = o.id
      where o.store_id = :storeId
        and o.status in ('PAID', 'PACKED', 'SHIPPED')
    `,
    { storeId },
  );
  const [currentCostRow] = await fetchTargetRows(
    `
      select coalesce(sum(oi.qty_base * p.cost_base), 0) as value
      from order_items oi
      inner join orders o on oi.order_id = o.id
      inner join products p on oi.product_id = p.id
      where o.store_id = :storeId
        and o.status in ('PAID', 'PACKED', 'SHIPPED')
    `,
    { storeId },
  );
  const [shippingRow] = await fetchTargetRows(
    `
      select coalesce(sum(shipping_cost), 0) as value
      from orders
      where store_id = :storeId
        and status in ('PAID', 'PACKED', 'SHIPPED')
    `,
    { storeId },
  );

  const revenue = toNumber(revenueRow?.value);
  const cogs = toNumber(cogsRow?.value);
  const currentCostCogs = toNumber(currentCostRow?.value);
  const shippingCost = toNumber(shippingRow?.value);
  const grossProfit = revenue - cogs - shippingCost;
  const currentCostGrossProfit = revenue - currentCostCogs - shippingCost;

  return {
    revenue,
    cogs,
    currentCostCogs,
    shippingCost,
    grossProfit,
    currentCostGrossProfit,
    grossProfitDeltaVsCurrentCost: grossProfit - currentCostGrossProfit,
  };
};

const mapCodProviderRows = (rows) =>
  sortCodByProvider(
    rows.map((row) => {
      const settledAmount = toNumber(row.settledAmount);
      const returnedShippingLoss = toNumber(row.returnedShippingLoss);
      return {
        provider: row.provider,
        pendingCount: toNumber(row.pendingCount),
        pendingAmount: toNumber(row.pendingAmount),
        settledCount: toNumber(row.settledCount),
        settledAmount,
        returnedCount: toNumber(row.returnedCount),
        returnedShippingLoss,
        returnedCodFee: toNumber(row.returnedCodFee),
        netAmount: settledAmount - returnedShippingLoss,
      };
    }),
  );

const fetchSourceCodOverview = async (storeId, bounds) => {
  const [overviewRow] = await fetchSourceRows(
    `
      select
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then 1 else 0 end), 0) as "pendingCount",
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "pendingAmount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
            and cod_settled_at >= ?
            and cod_settled_at < ?
          then 1 else 0 end), 0) as "settledTodayCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
            and cod_settled_at >= ?
            and cod_settled_at < ?
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledTodayAmount",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= ?
            and cod_returned_at < ?
          then 1 else 0 end), 0) as "returnedTodayCount",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= ?
            and cod_returned_at < ?
          then shipping_cost
          else 0 end), 0) as "returnedTodayShippingLoss",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= ?
            and cod_returned_at < ?
          then cod_fee
          else 0 end), 0) as "returnedTodayCodFee",
        coalesce(sum(case when payment_status = 'COD_SETTLED' then 1 else 0 end), 0) as "settledAllCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledAllAmount",
        coalesce(sum(case when status = 'COD_RETURNED' then 1 else 0 end), 0) as "returnedCount",
        coalesce(sum(case when status = 'COD_RETURNED' then shipping_cost else 0 end), 0) as "returnedShippingLoss",
        coalesce(sum(case when status = 'COD_RETURNED' then cod_fee else 0 end), 0) as "returnedCodFee"
      from orders
      where store_id = ?
        and payment_method = 'COD'
    `,
    [
      bounds.todayStartUtc,
      bounds.tomorrowStartUtc,
      bounds.todayStartUtc,
      bounds.tomorrowStartUtc,
      bounds.todayStartUtc,
      bounds.tomorrowStartUtc,
      bounds.todayStartUtc,
      bounds.tomorrowStartUtc,
      bounds.todayStartUtc,
      bounds.tomorrowStartUtc,
      storeId,
    ],
  );
  const providerRows = await fetchSourceRows(
    `
      select
        coalesce(nullif(trim(shipping_provider), ''), nullif(trim(shipping_carrier), ''), 'ไม่ระบุ') as provider,
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then 1 else 0 end), 0) as "pendingCount",
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "pendingAmount",
        coalesce(sum(case when payment_status = 'COD_SETTLED' then 1 else 0 end), 0) as "settledCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledAmount",
        coalesce(sum(case when status = 'COD_RETURNED' then 1 else 0 end), 0) as "returnedCount",
        coalesce(sum(case when status = 'COD_RETURNED' then shipping_cost else 0 end), 0) as "returnedShippingLoss",
        coalesce(sum(case when status = 'COD_RETURNED' then cod_fee else 0 end), 0) as "returnedCodFee"
      from orders
      where store_id = ?
        and payment_method = 'COD'
      group by provider
      order by coalesce(sum(case
        when payment_status = 'COD_SETTLED'
        then case when cod_amount > 0 then cod_amount else total end
        else 0 end), 0) desc
    `,
    [storeId],
  );

  const settledAllAmount = toNumber(overviewRow?.settledAllAmount);
  const returnedShippingLoss = toNumber(overviewRow?.returnedShippingLoss);

  return {
    pendingCount: toNumber(overviewRow?.pendingCount),
    pendingAmount: toNumber(overviewRow?.pendingAmount),
    settledTodayCount: toNumber(overviewRow?.settledTodayCount),
    settledTodayAmount: toNumber(overviewRow?.settledTodayAmount),
    returnedTodayCount: toNumber(overviewRow?.returnedTodayCount),
    returnedTodayShippingLoss: toNumber(overviewRow?.returnedTodayShippingLoss),
    returnedTodayCodFee: toNumber(overviewRow?.returnedTodayCodFee),
    settledAllCount: toNumber(overviewRow?.settledAllCount),
    settledAllAmount,
    returnedCount: toNumber(overviewRow?.returnedCount),
    returnedShippingLoss,
    returnedCodFee: toNumber(overviewRow?.returnedCodFee),
    netAmount: settledAllAmount - returnedShippingLoss,
    byProvider: mapCodProviderRows(providerRows),
  };
};

const fetchTargetCodOverview = async (storeId, bounds) => {
  const [overviewRow] = await fetchTargetRows(
    `
      select
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then 1 else 0 end), 0) as "pendingCount",
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "pendingAmount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
            and cod_settled_at >= :todayStartUtc
            and cod_settled_at < :tomorrowStartUtc
          then 1 else 0 end), 0) as "settledTodayCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
            and cod_settled_at >= :todayStartUtc
            and cod_settled_at < :tomorrowStartUtc
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledTodayAmount",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= :todayStartUtc
            and cod_returned_at < :tomorrowStartUtc
          then 1 else 0 end), 0) as "returnedTodayCount",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= :todayStartUtc
            and cod_returned_at < :tomorrowStartUtc
          then shipping_cost
          else 0 end), 0) as "returnedTodayShippingLoss",
        coalesce(sum(case
          when status = 'COD_RETURNED'
            and cod_returned_at >= :todayStartUtc
            and cod_returned_at < :tomorrowStartUtc
          then cod_fee
          else 0 end), 0) as "returnedTodayCodFee",
        coalesce(sum(case when payment_status = 'COD_SETTLED' then 1 else 0 end), 0) as "settledAllCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledAllAmount",
        coalesce(sum(case when status = 'COD_RETURNED' then 1 else 0 end), 0) as "returnedCount",
        coalesce(sum(case when status = 'COD_RETURNED' then shipping_cost else 0 end), 0) as "returnedShippingLoss",
        coalesce(sum(case when status = 'COD_RETURNED' then cod_fee else 0 end), 0) as "returnedCodFee"
      from orders
      where store_id = :storeId
        and payment_method = 'COD'
    `,
    {
      storeId,
      todayStartUtc: bounds.todayStartUtc,
      tomorrowStartUtc: bounds.tomorrowStartUtc,
    },
  );
  const providerRows = await fetchTargetRows(
    `
      select
        coalesce(nullif(trim(shipping_provider), ''), nullif(trim(shipping_carrier), ''), 'ไม่ระบุ') as provider,
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then 1 else 0 end), 0) as "pendingCount",
        coalesce(sum(case
          when status = 'SHIPPED'
            and payment_status = 'COD_PENDING_SETTLEMENT'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "pendingAmount",
        coalesce(sum(case when payment_status = 'COD_SETTLED' then 1 else 0 end), 0) as "settledCount",
        coalesce(sum(case
          when payment_status = 'COD_SETTLED'
          then case when cod_amount > 0 then cod_amount else total end
          else 0 end), 0) as "settledAmount",
        coalesce(sum(case when status = 'COD_RETURNED' then 1 else 0 end), 0) as "returnedCount",
        coalesce(sum(case when status = 'COD_RETURNED' then shipping_cost else 0 end), 0) as "returnedShippingLoss",
        coalesce(sum(case when status = 'COD_RETURNED' then cod_fee else 0 end), 0) as "returnedCodFee"
      from orders
      where store_id = :storeId
        and payment_method = 'COD'
      group by provider
      order by coalesce(sum(case
        when payment_status = 'COD_SETTLED'
        then case when cod_amount > 0 then cod_amount else total end
        else 0 end), 0) desc
    `,
    { storeId },
  );

  const settledAllAmount = toNumber(overviewRow?.settledAllAmount);
  const returnedShippingLoss = toNumber(overviewRow?.returnedShippingLoss);

  return {
    pendingCount: toNumber(overviewRow?.pendingCount),
    pendingAmount: toNumber(overviewRow?.pendingAmount),
    settledTodayCount: toNumber(overviewRow?.settledTodayCount),
    settledTodayAmount: toNumber(overviewRow?.settledTodayAmount),
    returnedTodayCount: toNumber(overviewRow?.returnedTodayCount),
    returnedTodayShippingLoss: toNumber(overviewRow?.returnedTodayShippingLoss),
    returnedTodayCodFee: toNumber(overviewRow?.returnedTodayCodFee),
    settledAllCount: toNumber(overviewRow?.settledAllCount),
    settledAllAmount,
    returnedCount: toNumber(overviewRow?.returnedCount),
    returnedShippingLoss,
    returnedCodFee: toNumber(overviewRow?.returnedCodFee),
    netAmount: settledAllAmount - returnedShippingLoss,
    byProvider: mapCodProviderRows(providerRows),
  };
};

const fetchSourcePurchaseFx = async (storeId, storeCurrency) => {
  const [summaryRow] = await fetchSourceRows(
    `
      select
        coalesce(sum(case
          when status = 'RECEIVED'
            and purchase_currency <> ?
            and exchange_rate_locked_at is null
          then 1 else 0 end), 0) as "pendingRateCount",
        coalesce(sum(case
          when status = 'RECEIVED'
            and purchase_currency <> ?
            and exchange_rate_locked_at is null
            and payment_status = 'UNPAID'
          then 1 else 0 end), 0) as "pendingRateUnpaidCount",
        coalesce(sum(case
          when purchase_currency <> ?
            and exchange_rate_locked_at is not null
          then 1 else 0 end), 0) as "lockedCount",
        coalesce(sum(case
          when purchase_currency <> ?
            and exchange_rate_locked_at is not null
            and exchange_rate <> exchange_rate_initial
          then 1 else 0 end), 0) as "changedRateCount",
        coalesce(sum(case
          when purchase_currency <> ?
            and exchange_rate_locked_at is not null
          then (
            (exchange_rate - exchange_rate_initial) * coalesce((
              select sum(
                poi.unit_cost_purchase * case
                  when poi.qty_received > 0 then poi.qty_received
                  else poi.qty_ordered
                end
              )
              from purchase_order_items poi
              where poi.purchase_order_id = purchase_orders.id
            ), 0)
          )
          else 0 end), 0) as "totalRateDeltaBase"
      from purchase_orders
      where store_id = ?
    `,
    [storeCurrency, storeCurrency, storeCurrency, storeCurrency, storeCurrency, storeId],
  );
  const recentRows = await fetchSourceRows(
    `
      select
        id,
        po_number as "poNumber",
        supplier_name as "supplierName",
        purchase_currency as "purchaseCurrency",
        exchange_rate_initial as "exchangeRateInitial",
        exchange_rate as "exchangeRate",
        exchange_rate_locked_at as "exchangeRateLockedAt",
        payment_status as "paymentStatus"
      from purchase_orders
      where store_id = ?
        and purchase_currency <> ?
        and exchange_rate_locked_at is not null
      order by exchange_rate_locked_at desc
      limit 5
    `,
    [storeId, storeCurrency],
  );

  return {
    pendingRateCount: toNumber(summaryRow?.pendingRateCount),
    pendingRateUnpaidCount: toNumber(summaryRow?.pendingRateUnpaidCount),
    lockedCount: toNumber(summaryRow?.lockedCount),
    changedRateCount: toNumber(summaryRow?.changedRateCount),
    totalRateDeltaBase: toNumber(summaryRow?.totalRateDeltaBase),
    recentLocks: sortRecentLocks(
      recentRows.map((row) => ({
        id: row.id,
        poNumber: row.poNumber,
        supplierName: row.supplierName,
        purchaseCurrency: row.purchaseCurrency,
        exchangeRateInitial: toNumber(row.exchangeRateInitial),
        exchangeRate: toNumber(row.exchangeRate),
        exchangeRateLockedAt: row.exchangeRateLockedAt,
        paymentStatus: row.paymentStatus,
      })),
    ),
  };
};

const fetchTargetPurchaseFx = async (storeId, storeCurrency) => {
  const [summaryRow] = await fetchTargetRows(
    `
      select
        coalesce(sum(case
          when status = 'RECEIVED'
            and purchase_currency <> :storeCurrency
            and exchange_rate_locked_at is null
          then 1 else 0 end), 0) as "pendingRateCount",
        coalesce(sum(case
          when status = 'RECEIVED'
            and purchase_currency <> :storeCurrency
            and exchange_rate_locked_at is null
            and payment_status = 'UNPAID'
          then 1 else 0 end), 0) as "pendingRateUnpaidCount",
        coalesce(sum(case
          when purchase_currency <> :storeCurrency
            and exchange_rate_locked_at is not null
          then 1 else 0 end), 0) as "lockedCount",
        coalesce(sum(case
          when purchase_currency <> :storeCurrency
            and exchange_rate_locked_at is not null
            and exchange_rate <> exchange_rate_initial
          then 1 else 0 end), 0) as "changedRateCount",
        coalesce(sum(case
          when purchase_currency <> :storeCurrency
            and exchange_rate_locked_at is not null
          then (
            (exchange_rate - exchange_rate_initial) * coalesce((
              select sum(
                poi.unit_cost_purchase * case
                  when poi.qty_received > 0 then poi.qty_received
                  else poi.qty_ordered
                end
              )
              from purchase_order_items poi
              where poi.purchase_order_id = purchase_orders.id
            ), 0)
          )
          else 0 end), 0) as "totalRateDeltaBase"
      from purchase_orders
      where store_id = :storeId
    `,
    { storeId, storeCurrency },
  );
  const recentRows = await fetchTargetRows(
    `
      select
        id,
        po_number as "poNumber",
        supplier_name as "supplierName",
        purchase_currency as "purchaseCurrency",
        exchange_rate_initial as "exchangeRateInitial",
        exchange_rate as "exchangeRate",
        exchange_rate_locked_at as "exchangeRateLockedAt",
        payment_status as "paymentStatus"
      from purchase_orders
      where store_id = :storeId
        and purchase_currency <> :storeCurrency
        and exchange_rate_locked_at is not null
      order by exchange_rate_locked_at desc
      limit 5
    `,
    { storeId, storeCurrency },
  );

  return {
    pendingRateCount: toNumber(summaryRow?.pendingRateCount),
    pendingRateUnpaidCount: toNumber(summaryRow?.pendingRateUnpaidCount),
    lockedCount: toNumber(summaryRow?.lockedCount),
    changedRateCount: toNumber(summaryRow?.changedRateCount),
    totalRateDeltaBase: toNumber(summaryRow?.totalRateDeltaBase),
    recentLocks: sortRecentLocks(
      recentRows.map((row) => ({
        id: row.id,
        poNumber: row.poNumber,
        supplierName: row.supplierName,
        purchaseCurrency: row.purchaseCurrency,
        exchangeRateInitial: toNumber(row.exchangeRateInitial),
        exchangeRate: toNumber(row.exchangeRate),
        exchangeRateLockedAt: row.exchangeRateLockedAt,
        paymentStatus: row.paymentStatus,
      })),
    ),
  };
};

const fetchSourceOutstandingRows = async (storeId, storeCurrency) => {
  const rows = await fetchSourceRows(
    `
      select
        po.id as "poId",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.due_date as "dueDate",
        po.received_at as "receivedAt",
        po.payment_status as "paymentStatus",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate as "exchangeRate",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        (
          coalesce((
            select sum(poi.unit_cost_base * poi.qty_ordered)
            from purchase_order_items poi
            where poi.purchase_order_id = po.id
          ), 0) + po.shipping_cost + po.other_cost
        ) as "grandTotalBase",
        (
          coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) as "totalPaidBase",
        (
          (
            coalesce((
              select sum(poi.unit_cost_base * poi.qty_ordered)
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0) + po.shipping_cost + po.other_cost
          ) - coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) as "outstandingBase",
        cast(case
          when julianday('now') - julianday(coalesce(po.due_date, po.received_at, po.created_at)) < 0 then 0
          else julianday('now') - julianday(coalesce(po.due_date, po.received_at, po.created_at))
        end as integer) as "ageDays",
        case
          when po.purchase_currency <> ?
            and po.exchange_rate_locked_at is not null
            and po.exchange_rate <> po.exchange_rate_initial
          then (
            (po.exchange_rate - po.exchange_rate_initial) * coalesce((
              select sum(
                poi.unit_cost_purchase * case
                  when poi.qty_received > 0 then poi.qty_received
                  else poi.qty_ordered
                end
              )
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0)
          )
          else 0
        end as "fxDeltaBase"
      from purchase_orders po
      where po.store_id = ?
        and po.status = 'RECEIVED'
        and (
          (
            coalesce((
              select sum(poi.unit_cost_base * poi.qty_ordered)
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0) + po.shipping_cost + po.other_cost
          ) - coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) > 0
      order by po.due_date desc, po.received_at desc
    `,
    [storeCurrency, storeId],
  );

  return sortOutstandingRows(
    rows.map((row) => ({
      poId: row.poId,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      purchaseCurrency: row.purchaseCurrency,
      dueDate: row.dueDate,
      receivedAt: row.receivedAt,
      paymentStatus: row.paymentStatus,
      grandTotalBase: toNumber(row.grandTotalBase),
      totalPaidBase: toNumber(row.totalPaidBase),
      outstandingBase: toNumber(row.outstandingBase),
      ageDays: toNumber(row.ageDays),
      fxDeltaBase: toNumber(row.fxDeltaBase),
      exchangeRateInitial: toNumber(row.exchangeRateInitial),
      exchangeRate: toNumber(row.exchangeRate),
      exchangeRateLockedAt: row.exchangeRateLockedAt,
    })),
  );
};

const fetchTargetOutstandingRows = async (storeId, storeCurrency) => {
  const rows = await fetchTargetRows(
    `
      select
        po.id as "poId",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.due_date as "dueDate",
        po.received_at as "receivedAt",
        po.payment_status as "paymentStatus",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate as "exchangeRate",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        (
          coalesce((
            select sum(poi.unit_cost_base * poi.qty_ordered)
            from purchase_order_items poi
            where poi.purchase_order_id = po.id
          ), 0) + po.shipping_cost + po.other_cost
        ) as "grandTotalBase",
        (
          coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) as "totalPaidBase",
        (
          (
            coalesce((
              select sum(poi.unit_cost_base * poi.qty_ordered)
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0) + po.shipping_cost + po.other_cost
          ) - coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) as "outstandingBase",
        greatest(floor(extract(epoch from (
          timezone('UTC', now()) - coalesce(
            po.due_date::timestamp,
            po.received_at::timestamptz at time zone 'UTC',
            po.created_at::timestamptz at time zone 'UTC'
          )
        )) / 86400), 0) as "ageDays",
        case
          when po.purchase_currency <> :storeCurrency
            and po.exchange_rate_locked_at is not null
            and po.exchange_rate <> po.exchange_rate_initial
          then (
            (po.exchange_rate - po.exchange_rate_initial) * coalesce((
              select sum(
                poi.unit_cost_purchase * case
                  when poi.qty_received > 0 then poi.qty_received
                  else poi.qty_ordered
                end
              )
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0)
          )
          else 0
        end as "fxDeltaBase"
      from purchase_orders po
      where po.store_id = :storeId
        and po.status = 'RECEIVED'
        and (
          (
            coalesce((
              select sum(poi.unit_cost_base * poi.qty_ordered)
              from purchase_order_items poi
              where poi.purchase_order_id = po.id
            ), 0) + po.shipping_cost + po.other_cost
          ) - coalesce((
            select sum(case
              when pop.entry_type = 'PAYMENT' then pop.amount_base
              when pop.entry_type = 'REVERSAL' then -pop.amount_base
              else 0
            end)
            from purchase_order_payments pop
            where pop.purchase_order_id = po.id
          ), 0)
        ) > 0
      order by po.due_date desc nulls last, po.received_at desc nulls last
    `,
    { storeId, storeCurrency },
  );

  return sortOutstandingRows(
    rows.map((row) => ({
      poId: row.poId,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      purchaseCurrency: row.purchaseCurrency,
      dueDate: row.dueDate,
      receivedAt: row.receivedAt,
      paymentStatus: row.paymentStatus,
      grandTotalBase: toNumber(row.grandTotalBase),
      totalPaidBase: toNumber(row.totalPaidBase),
      outstandingBase: toNumber(row.outstandingBase),
      ageDays: toNumber(row.ageDays),
      fxDeltaBase: toNumber(row.fxDeltaBase),
      exchangeRateInitial: toNumber(row.exchangeRateInitial),
      exchangeRate: toNumber(row.exchangeRate),
      exchangeRateLockedAt: row.exchangeRateLockedAt,
    })),
  );
};

const buildPurchaseApAging = (rows) => {
  const summary = {
    totalOutstandingBase: 0,
    bucket0To30: { count: 0, amountBase: 0 },
    bucket31To60: { count: 0, amountBase: 0 },
    bucket61Plus: { count: 0, amountBase: 0 },
    suppliers: [],
  };

  const supplierMap = new Map();

  for (const row of rows) {
    summary.totalOutstandingBase += row.outstandingBase;
    if (row.ageDays <= 30) {
      summary.bucket0To30.count += 1;
      summary.bucket0To30.amountBase += row.outstandingBase;
    } else if (row.ageDays <= 60) {
      summary.bucket31To60.count += 1;
      summary.bucket31To60.amountBase += row.outstandingBase;
    } else {
      summary.bucket61Plus.count += 1;
      summary.bucket61Plus.amountBase += row.outstandingBase;
    }

    const supplierName = row.supplierName?.trim() || "ไม่ระบุซัพพลายเออร์";
    const current = supplierMap.get(supplierName) ?? {
      outstandingBase: 0,
      fxDeltaBase: 0,
      poCount: 0,
    };
    current.outstandingBase += row.outstandingBase;
    current.fxDeltaBase += row.fxDeltaBase;
    current.poCount += 1;
    supplierMap.set(supplierName, current);
  }

  summary.suppliers = sortSuppliers(
    Array.from(supplierMap.entries()).map(([supplierName, value]) => ({
      supplierName,
      outstandingBase: value.outstandingBase,
      fxDeltaBase: value.fxDeltaBase,
      poCount: value.poCount,
    })),
  );

  return summary;
};

const buildOverview = async (storeId, storeCurrency, bounds, sourceType) => {
  const fetcher = sourceType === "source"
    ? {
        salesSummary: fetchSourceSalesSummary,
        topProducts: fetchSourceTopProducts,
        salesByChannel: fetchSourceSalesByChannel,
        grossProfit: fetchSourceGrossProfit,
        codOverview: fetchSourceCodOverview,
        purchaseFx: fetchSourcePurchaseFx,
        outstandingRows: fetchSourceOutstandingRows,
      }
    : {
        salesSummary: fetchTargetSalesSummary,
        topProducts: fetchTargetTopProducts,
        salesByChannel: fetchTargetSalesByChannel,
        grossProfit: fetchTargetGrossProfit,
        codOverview: fetchTargetCodOverview,
        purchaseFx: fetchTargetPurchaseFx,
        outstandingRows: fetchTargetOutstandingRows,
      };

  const [
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
    codOverview,
    purchaseFx,
    outstandingRows,
  ] = await Promise.all([
    fetcher.salesSummary(storeId, bounds),
    fetcher.topProducts(storeId),
    fetcher.salesByChannel(storeId),
    fetcher.grossProfit(storeId),
    fetcher.codOverview(storeId, bounds),
    fetcher.purchaseFx(storeId, storeCurrency),
    fetcher.outstandingRows(storeId, storeCurrency),
  ]);

  return {
    storeCurrency,
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
    codOverview: {
      ...codOverview,
      byProvider: sortCodByProvider(codOverview.byProvider),
    },
    purchaseFx: {
      ...purchaseFx,
      recentLocks: sortRecentLocks(purchaseFx.recentLocks),
    },
    purchaseApAging: buildPurchaseApAging(outstandingRows),
    outstandingRows,
  };
};

const main = async () => {
  const bounds = getReportDateBounds();
  const storeIds = await getStoreIds();
  const currencyMap = await getStoreCurrencyMap();
  let checkedStores = 0;

  for (const storeId of storeIds) {
    const storeCurrency = currencyMap.get(storeId) ?? "LAK";
    const sourceOverview = await buildOverview(storeId, storeCurrency, bounds, "source");
    const targetOverview = await buildOverview(storeId, storeCurrency, bounds, "target");

    const sourceOutstandingRows = sourceOverview.outstandingRows;
    const targetOutstandingRows = targetOverview.outstandingRows;

    if (asComparableJson(sourceOutstandingRows) !== asComparableJson(targetOutstandingRows)) {
      console.error(`[reports.compare] outstanding rows mismatch storeId=${storeId}`);
      process.exit(1);
    }

    if (
      asComparableJson({
        ...sourceOverview,
        outstandingRows: undefined,
      }) !==
      asComparableJson({
        ...targetOverview,
        outstandingRows: undefined,
      })
    ) {
      console.error(`[reports.compare] reports overview mismatch storeId=${storeId}`);
      process.exit(1);
    }

    checkedStores += 1;
  }

  console.log(`[reports.compare] parity ok stores=${checkedStores}`);
};

try {
  await main();
} finally {
  await Promise.allSettled([target.close(), source.close()]);
}
