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

const toBoolean = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  return Boolean(value);
};

const toInteger = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toJsonString = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return JSON.stringify(trimmed);
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
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

const LEGACY_TIMESTAMP_FALLBACK = "1970-01-01T00:00:00.000Z";

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const countTargetRows = async (tableName) => {
  const [rows] = await target.query(`select count(*)::int as value from ${tableName}`);
  return Array.isArray(rows) ? Number(rows[0]?.value ?? 0) : 0;
};

const backfillUsers = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      email,
      name,
      password_hash as "passwordHash",
      created_by as "createdBy",
      must_change_password as "mustChangePassword",
      password_updated_at as "passwordUpdatedAt",
      system_role as "systemRole",
      can_create_stores as "canCreateStores",
      max_stores as "maxStores",
      can_create_branches as "canCreateBranches",
      max_branches_per_store as "maxBranchesPerStore",
      session_limit as "sessionLimit",
      created_at as "createdAt"
    from users
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into users (
            id,
            email,
            name,
            password_hash,
            created_by,
            must_change_password,
            password_updated_at,
            system_role,
            can_create_stores,
            max_stores,
            can_create_branches,
            max_branches_per_store,
            session_limit,
            created_at
          )
          values (
            :id,
            :email,
            :name,
            :passwordHash,
            null,
            :mustChangePassword,
            :passwordUpdatedAt,
            :systemRole,
            :canCreateStores,
            :maxStores,
            :canCreateBranches,
            :maxBranchesPerStore,
            :sessionLimit,
            :createdAt
          )
          on conflict (id) do update set
            email = excluded.email,
            name = excluded.name,
            password_hash = excluded.password_hash,
            must_change_password = excluded.must_change_password,
            password_updated_at = excluded.password_updated_at,
            system_role = excluded.system_role,
            can_create_stores = excluded.can_create_stores,
            max_stores = excluded.max_stores,
            can_create_branches = excluded.can_create_branches,
            max_branches_per_store = excluded.max_branches_per_store,
            session_limit = excluded.session_limit,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            email: row.email,
            name: row.name,
            passwordHash: row.passwordHash,
            mustChangePassword: toBoolean(row.mustChangePassword) ?? false,
            passwordUpdatedAt: row.passwordUpdatedAt ?? null,
            systemRole: row.systemRole ?? "USER",
            canCreateStores: toBoolean(row.canCreateStores),
            maxStores: toInteger(row.maxStores),
            canCreateBranches: toBoolean(row.canCreateBranches),
            maxBranchesPerStore: toInteger(row.maxBranchesPerStore),
            sessionLimit: toInteger(row.sessionLimit),
            createdAt: row.createdAt,
          },
        },
      );
    }

    for (const row of rows) {
      await target.query(
        `
          update users
          set created_by = :createdBy
          where id = :id
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            createdBy: row.createdBy ?? null,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillStores = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      name,
      logo_name as "logoName",
      logo_url as "logoUrl",
      address,
      phone_number as "phoneNumber",
      store_type as "storeType",
      currency,
      supported_currencies as "supportedCurrencies",
      vat_enabled as "vatEnabled",
      vat_rate as "vatRate",
      vat_mode as "vatMode",
      out_stock_threshold as "outStockThreshold",
      low_stock_threshold as "lowStockThreshold",
      max_branches_override as "maxBranchesOverride",
      pdf_show_logo as "pdfShowLogo",
      pdf_show_signature as "pdfShowSignature",
      pdf_show_note as "pdfShowNote",
      pdf_header_color as "pdfHeaderColor",
      pdf_company_name as "pdfCompanyName",
      pdf_company_address as "pdfCompanyAddress",
      pdf_company_phone as "pdfCompanyPhone",
      created_at as "createdAt"
    from stores
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into stores (
            id,
            name,
            logo_name,
            logo_url,
            address,
            phone_number,
            store_type,
            currency,
            supported_currencies,
            vat_enabled,
            vat_rate,
            vat_mode,
            out_stock_threshold,
            low_stock_threshold,
            max_branches_override,
            pdf_show_logo,
            pdf_show_signature,
            pdf_show_note,
            pdf_header_color,
            pdf_company_name,
            pdf_company_address,
            pdf_company_phone,
            created_at
          )
          values (
            :id,
            :name,
            :logoName,
            :logoUrl,
            :address,
            :phoneNumber,
            :storeType,
            :currency,
            :supportedCurrencies,
            :vatEnabled,
            :vatRate,
            :vatMode,
            :outStockThreshold,
            :lowStockThreshold,
            :maxBranchesOverride,
            :pdfShowLogo,
            :pdfShowSignature,
            :pdfShowNote,
            :pdfHeaderColor,
            :pdfCompanyName,
            :pdfCompanyAddress,
            :pdfCompanyPhone,
            :createdAt
          )
          on conflict (id) do update set
            name = excluded.name,
            logo_name = excluded.logo_name,
            logo_url = excluded.logo_url,
            address = excluded.address,
            phone_number = excluded.phone_number,
            store_type = excluded.store_type,
            currency = excluded.currency,
            supported_currencies = excluded.supported_currencies,
            vat_enabled = excluded.vat_enabled,
            vat_rate = excluded.vat_rate,
            vat_mode = excluded.vat_mode,
            out_stock_threshold = excluded.out_stock_threshold,
            low_stock_threshold = excluded.low_stock_threshold,
            max_branches_override = excluded.max_branches_override,
            pdf_show_logo = excluded.pdf_show_logo,
            pdf_show_signature = excluded.pdf_show_signature,
            pdf_show_note = excluded.pdf_show_note,
            pdf_header_color = excluded.pdf_header_color,
            pdf_company_name = excluded.pdf_company_name,
            pdf_company_address = excluded.pdf_company_address,
            pdf_company_phone = excluded.pdf_company_phone,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            name: row.name,
            logoName: row.logoName ?? null,
            logoUrl: row.logoUrl ?? null,
            address: row.address ?? null,
            phoneNumber: row.phoneNumber ?? null,
            storeType: row.storeType ?? "ONLINE_RETAIL",
            currency: row.currency ?? "LAK",
            supportedCurrencies: row.supportedCurrencies ?? "[\"LAK\"]",
            vatEnabled: toBoolean(row.vatEnabled) ?? false,
            vatRate: toInteger(row.vatRate, 700) ?? 700,
            vatMode: row.vatMode ?? "EXCLUSIVE",
            outStockThreshold: toInteger(row.outStockThreshold, 0) ?? 0,
            lowStockThreshold: toInteger(row.lowStockThreshold, 10) ?? 10,
            maxBranchesOverride: toInteger(row.maxBranchesOverride),
            pdfShowLogo: toBoolean(row.pdfShowLogo) ?? true,
            pdfShowSignature: toBoolean(row.pdfShowSignature) ?? true,
            pdfShowNote: toBoolean(row.pdfShowNote) ?? true,
            pdfHeaderColor: row.pdfHeaderColor ?? "#f1f5f9",
            pdfCompanyName: row.pdfCompanyName ?? null,
            pdfCompanyAddress: row.pdfCompanyAddress ?? null,
            pdfCompanyPhone: row.pdfCompanyPhone ?? null,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillContacts = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      channel,
      display_name as "displayName",
      phone,
      last_inbound_at as "lastInboundAt",
      notes,
      created_at as "createdAt"
    from contacts
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into contacts (
            id,
            store_id,
            channel,
            display_name,
            phone,
            last_inbound_at,
            notes,
            created_at
          )
          values (
            :id,
            :storeId,
            :channel,
            :displayName,
            :phone,
            :lastInboundAt,
            :notes,
            :createdAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            channel = excluded.channel,
            display_name = excluded.display_name,
            phone = excluded.phone,
            last_inbound_at = excluded.last_inbound_at,
            notes = excluded.notes,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            channel: row.channel,
            displayName: row.displayName,
            phone: row.phone ?? null,
            lastInboundAt: row.lastInboundAt ?? null,
            notes: row.notes ?? null,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillStorePaymentAccounts = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      display_name as "displayName",
      account_type as "accountType",
      bank_name as "bankName",
      account_name as "accountName",
      account_number as "accountNumber",
      qr_image_url as "qrImageUrl",
      promptpay_id as "promptpayId",
      is_default as "isDefault",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from store_payment_accounts
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into store_payment_accounts (
            id,
            store_id,
            display_name,
            account_type,
            bank_name,
            account_name,
            account_number,
            qr_image_url,
            promptpay_id,
            is_default,
            is_active,
            created_at,
            updated_at
          )
          values (
            :id,
            :storeId,
            :displayName,
            :accountType,
            :bankName,
            :accountName,
            :accountNumber,
            :qrImageUrl,
            :promptpayId,
            :isDefault,
            :isActive,
            :createdAt,
            :updatedAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            display_name = excluded.display_name,
            account_type = excluded.account_type,
            bank_name = excluded.bank_name,
            account_name = excluded.account_name,
            account_number = excluded.account_number,
            qr_image_url = excluded.qr_image_url,
            promptpay_id = excluded.promptpay_id,
            is_default = excluded.is_default,
            is_active = excluded.is_active,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            displayName: row.displayName,
            accountType: row.accountType,
            bankName: row.bankName ?? null,
            accountName: row.accountName,
            accountNumber: row.accountNumber ?? null,
            qrImageUrl: row.qrImageUrl ?? null,
            promptpayId: row.promptpayId ?? null,
            isDefault: toBoolean(row.isDefault) ?? false,
            isActive: toBoolean(row.isActive) ?? true,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt ?? row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillUnits = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      scope,
      code,
      name_th as "nameTh",
      null as "createdAt"
    from units
    order by code asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into units (
            id,
            store_id,
            scope,
            code,
            name_th,
            created_at
          )
          values (
            :id,
            :storeId,
            :scope,
            :code,
            :nameTh,
            :createdAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            scope = excluded.scope,
            code = excluded.code,
            name_th = excluded.name_th,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId ?? null,
            scope: row.scope ?? "SYSTEM",
            code: row.code,
            nameTh: row.nameTh,
            createdAt: row.createdAt ?? LEGACY_TIMESTAMP_FALLBACK,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillProducts = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      sku,
      name,
      barcode,
      model_id as "modelId",
      variant_label as "variantLabel",
      variant_options_json as "variantOptionsJson",
      variant_sort_order as "variantSortOrder",
      image_url as "imageUrl",
      category_id as "categoryId",
      base_unit_id as "baseUnitId",
      price_base as "priceBase",
      cost_base as "costBase",
      out_stock_threshold as "outStockThreshold",
      low_stock_threshold as "lowStockThreshold",
      active,
      created_at as "createdAt"
    from products
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into products (
            id,
            store_id,
            sku,
            name,
            barcode,
            model_id,
            variant_label,
            variant_options_json,
            variant_sort_order,
            image_url,
            category_id,
            base_unit_id,
            price_base,
            cost_base,
            out_stock_threshold,
            low_stock_threshold,
            active,
            created_at
          )
          values (
            :id,
            :storeId,
            :sku,
            :name,
            :barcode,
            :modelId,
            :variantLabel,
            :variantOptionsJson,
            :variantSortOrder,
            :imageUrl,
            :categoryId,
            :baseUnitId,
            :priceBase,
            :costBase,
            :outStockThreshold,
            :lowStockThreshold,
            :active,
            :createdAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            sku = excluded.sku,
            name = excluded.name,
            barcode = excluded.barcode,
            model_id = excluded.model_id,
            variant_label = excluded.variant_label,
            variant_options_json = excluded.variant_options_json,
            variant_sort_order = excluded.variant_sort_order,
            image_url = excluded.image_url,
            category_id = excluded.category_id,
            base_unit_id = excluded.base_unit_id,
            price_base = excluded.price_base,
            cost_base = excluded.cost_base,
            out_stock_threshold = excluded.out_stock_threshold,
            low_stock_threshold = excluded.low_stock_threshold,
            active = excluded.active,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            sku: row.sku,
            name: row.name,
            barcode: row.barcode ?? null,
            modelId: row.modelId ?? null,
            variantLabel: row.variantLabel ?? null,
            variantOptionsJson: row.variantOptionsJson ?? null,
            variantSortOrder: toInteger(row.variantSortOrder, 0) ?? 0,
            imageUrl: row.imageUrl ?? null,
            categoryId: row.categoryId ?? null,
            baseUnitId: row.baseUnitId,
            priceBase: toInteger(row.priceBase, 0) ?? 0,
            costBase: toInteger(row.costBase, 0) ?? 0,
            outStockThreshold: toInteger(row.outStockThreshold),
            lowStockThreshold: toInteger(row.lowStockThreshold),
            active: toBoolean(row.active) ?? true,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillOrders = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      order_no as "orderNo",
      channel,
      status,
      contact_id as "contactId",
      customer_name as "customerName",
      customer_phone as "customerPhone",
      customer_address as "customerAddress",
      subtotal,
      discount,
      vat_amount as "vatAmount",
      shipping_fee_charged as "shippingFeeCharged",
      total,
      payment_currency as "paymentCurrency",
      payment_method as "paymentMethod",
      payment_status as "paymentStatus",
      payment_account_id as "paymentAccountId",
      payment_slip_url as "paymentSlipUrl",
      payment_proof_submitted_at as "paymentProofSubmittedAt",
      shipping_provider as "shippingProvider",
      shipping_label_status as "shippingLabelStatus",
      shipping_label_url as "shippingLabelUrl",
      shipping_label_file_key as "shippingLabelFileKey",
      shipping_request_id as "shippingRequestId",
      shipping_carrier as "shippingCarrier",
      tracking_no as "trackingNo",
      shipping_cost as "shippingCost",
      cod_amount as "codAmount",
      cod_fee as "codFee",
      cod_return_note as "codReturnNote",
      cod_settled_at as "codSettledAt",
      cod_returned_at as "codReturnedAt",
      paid_at as "paidAt",
      shipped_at as "shippedAt",
      created_by as "createdBy",
      created_at as "createdAt"
    from orders
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into orders (
            id,
            store_id,
            order_no,
            channel,
            status,
            contact_id,
            customer_name,
            customer_phone,
            customer_address,
            subtotal,
            discount,
            vat_amount,
            shipping_fee_charged,
            total,
            payment_currency,
            payment_method,
            payment_status,
            payment_account_id,
            payment_slip_url,
            payment_proof_submitted_at,
            shipping_provider,
            shipping_label_status,
            shipping_label_url,
            shipping_label_file_key,
            shipping_request_id,
            shipping_carrier,
            tracking_no,
            shipping_cost,
            cod_amount,
            cod_fee,
            cod_return_note,
            cod_settled_at,
            cod_returned_at,
            paid_at,
            shipped_at,
            created_by,
            created_at
          )
          values (
            :id,
            :storeId,
            :orderNo,
            :channel,
            :status,
            :contactId,
            :customerName,
            :customerPhone,
            :customerAddress,
            :subtotal,
            :discount,
            :vatAmount,
            :shippingFeeCharged,
            :total,
            :paymentCurrency,
            :paymentMethod,
            :paymentStatus,
            :paymentAccountId,
            :paymentSlipUrl,
            :paymentProofSubmittedAt,
            :shippingProvider,
            :shippingLabelStatus,
            :shippingLabelUrl,
            :shippingLabelFileKey,
            :shippingRequestId,
            :shippingCarrier,
            :trackingNo,
            :shippingCost,
            :codAmount,
            :codFee,
            :codReturnNote,
            :codSettledAt,
            :codReturnedAt,
            :paidAt,
            :shippedAt,
            :createdBy,
            :createdAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            order_no = excluded.order_no,
            channel = excluded.channel,
            status = excluded.status,
            contact_id = excluded.contact_id,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            subtotal = excluded.subtotal,
            discount = excluded.discount,
            vat_amount = excluded.vat_amount,
            shipping_fee_charged = excluded.shipping_fee_charged,
            total = excluded.total,
            payment_currency = excluded.payment_currency,
            payment_method = excluded.payment_method,
            payment_status = excluded.payment_status,
            payment_account_id = excluded.payment_account_id,
            payment_slip_url = excluded.payment_slip_url,
            payment_proof_submitted_at = excluded.payment_proof_submitted_at,
            shipping_provider = excluded.shipping_provider,
            shipping_label_status = excluded.shipping_label_status,
            shipping_label_url = excluded.shipping_label_url,
            shipping_label_file_key = excluded.shipping_label_file_key,
            shipping_request_id = excluded.shipping_request_id,
            shipping_carrier = excluded.shipping_carrier,
            tracking_no = excluded.tracking_no,
            shipping_cost = excluded.shipping_cost,
            cod_amount = excluded.cod_amount,
            cod_fee = excluded.cod_fee,
            cod_return_note = excluded.cod_return_note,
            cod_settled_at = excluded.cod_settled_at,
            cod_returned_at = excluded.cod_returned_at,
            paid_at = excluded.paid_at,
            shipped_at = excluded.shipped_at,
            created_by = excluded.created_by,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            orderNo: row.orderNo,
            channel: row.channel ?? "WALK_IN",
            status: row.status ?? "DRAFT",
            contactId: row.contactId ?? null,
            customerName: row.customerName ?? null,
            customerPhone: row.customerPhone ?? null,
            customerAddress: row.customerAddress ?? null,
            subtotal: toInteger(row.subtotal, 0) ?? 0,
            discount: toInteger(row.discount, 0) ?? 0,
            vatAmount: toInteger(row.vatAmount, 0) ?? 0,
            shippingFeeCharged: toInteger(row.shippingFeeCharged, 0) ?? 0,
            total: toInteger(row.total, 0) ?? 0,
            paymentCurrency: row.paymentCurrency ?? "LAK",
            paymentMethod: row.paymentMethod ?? "CASH",
            paymentStatus: row.paymentStatus ?? "UNPAID",
            paymentAccountId: row.paymentAccountId ?? null,
            paymentSlipUrl: row.paymentSlipUrl ?? null,
            paymentProofSubmittedAt: row.paymentProofSubmittedAt ?? null,
            shippingProvider: row.shippingProvider ?? null,
            shippingLabelStatus: row.shippingLabelStatus ?? "NONE",
            shippingLabelUrl: row.shippingLabelUrl ?? null,
            shippingLabelFileKey: row.shippingLabelFileKey ?? null,
            shippingRequestId: row.shippingRequestId ?? null,
            shippingCarrier: row.shippingCarrier ?? null,
            trackingNo: row.trackingNo ?? null,
            shippingCost: toInteger(row.shippingCost, 0) ?? 0,
            codAmount: toInteger(row.codAmount, 0) ?? 0,
            codFee: toInteger(row.codFee, 0) ?? 0,
            codReturnNote: row.codReturnNote ?? null,
            codSettledAt: row.codSettledAt ?? null,
            codReturnedAt: row.codReturnedAt ?? null,
            paidAt: row.paidAt ?? null,
            shippedAt: row.shippedAt ?? null,
            createdBy: row.createdBy,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillOrderItems = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      order_id as "orderId",
      product_id as "productId",
      unit_id as "unitId",
      qty,
      qty_base as "qtyBase",
      price_base_at_sale as "priceBaseAtSale",
      cost_base_at_sale as "costBaseAtSale",
      line_total as "lineTotal"
    from order_items
    order by order_id asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into order_items (
            id,
            order_id,
            product_id,
            unit_id,
            qty,
            qty_base,
            price_base_at_sale,
            cost_base_at_sale,
            line_total
          )
          values (
            :id,
            :orderId,
            :productId,
            :unitId,
            :qty,
            :qtyBase,
            :priceBaseAtSale,
            :costBaseAtSale,
            :lineTotal
          )
          on conflict (id) do update set
            order_id = excluded.order_id,
            product_id = excluded.product_id,
            unit_id = excluded.unit_id,
            qty = excluded.qty,
            qty_base = excluded.qty_base,
            price_base_at_sale = excluded.price_base_at_sale,
            cost_base_at_sale = excluded.cost_base_at_sale,
            line_total = excluded.line_total
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            orderId: row.orderId,
            productId: row.productId,
            unitId: row.unitId,
            qty: toInteger(row.qty, 0) ?? 0,
            qtyBase: toInteger(row.qtyBase, 0) ?? 0,
            priceBaseAtSale: toInteger(row.priceBaseAtSale, 0) ?? 0,
            costBaseAtSale: toInteger(row.costBaseAtSale, 0) ?? 0,
            lineTotal: toInteger(row.lineTotal, 0) ?? 0,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillAuditEvents = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      scope,
      store_id as "storeId",
      actor_user_id as "actorUserId",
      actor_name as "actorName",
      actor_role as "actorRole",
      action,
      entity_type as "entityType",
      entity_id as "entityId",
      result,
      reason_code as "reasonCode",
      ip_address as "ipAddress",
      user_agent as "userAgent",
      request_id as "requestId",
      metadata,
      before,
      after,
      occurred_at as "occurredAt"
    from audit_events
    order by occurred_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
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
          on conflict (id) do update set
            scope = excluded.scope,
            store_id = excluded.store_id,
            actor_user_id = excluded.actor_user_id,
            actor_name = excluded.actor_name,
            actor_role = excluded.actor_role,
            action = excluded.action,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            result = excluded.result,
            reason_code = excluded.reason_code,
            ip_address = excluded.ip_address,
            user_agent = excluded.user_agent,
            request_id = excluded.request_id,
            metadata = excluded.metadata,
            before = excluded.before,
            after = excluded.after,
            occurred_at = excluded.occurred_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            scope: row.scope,
            storeId: row.storeId ?? null,
            actorUserId: row.actorUserId ?? null,
            actorName: row.actorName ?? null,
            actorRole: row.actorRole ?? null,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId ?? null,
            result: row.result ?? "SUCCESS",
            reasonCode: row.reasonCode ?? null,
            ipAddress: row.ipAddress ?? null,
            userAgent: row.userAgent ?? null,
            requestId: row.requestId ?? null,
            metadata: toJsonString(row.metadata),
            before: toJsonString(row.before),
            after: toJsonString(row.after),
            occurredAt: row.occurredAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillPlan = [
  { table: "users", run: backfillUsers },
  { table: "stores", run: backfillStores },
  { table: "contacts", run: backfillContacts },
  { table: "store_payment_accounts", run: backfillStorePaymentAccounts },
  { table: "units", run: backfillUnits },
  { table: "products", run: backfillProducts },
  { table: "orders", run: backfillOrders },
  { table: "order_items", run: backfillOrderItems },
  { table: "audit_events", run: backfillAuditEvents },
];

try {
  await target.authenticate();
  await source.execute("select 1 as health_check");

  for (const step of backfillPlan) {
    const sourceCount = await step.run();
    const targetCount = await countTargetRows(step.table);
    console.info(`[pg:backfill] ${step.table} source=${sourceCount} target=${targetCount}`);
  }

  console.info("[pg:backfill] done");
} catch (error) {
  console.error("[pg:backfill] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await target.close();
  } catch {}
  try {
    source.close();
  } catch {}
}
