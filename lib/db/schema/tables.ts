import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAtDefault = sql`(CURRENT_TIMESTAMP)`;

export const storeTypeEnum = [
  "ONLINE_RETAIL",
  "RESTAURANT",
  "CAFE",
  "OTHER",
] as const;
export const storeCurrencyEnum = ["LAK", "THB", "USD"] as const;
export const storeVatModeEnum = ["EXCLUSIVE", "INCLUSIVE"] as const;
export const paymentAccountTypeEnum = ["BANK", "LAO_QR"] as const;
export const memberStatusEnum = ["ACTIVE", "INVITED", "SUSPENDED"] as const;
export const movementTypeEnum = [
  "IN",
  "OUT",
  "RESERVE",
  "RELEASE",
  "ADJUST",
  "RETURN",
] as const;
export const movementRefTypeEnum = ["ORDER", "MANUAL", "RETURN"] as const;
export const orderChannelEnum = ["WALK_IN", "FACEBOOK", "WHATSAPP"] as const;
export const orderPaymentMethodEnum = ["CASH", "LAO_QR"] as const;
export const orderStatusEnum = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
  "PACKED",
  "SHIPPED",
  "CANCELLED",
] as const;
export const contactChannelEnum = ["FACEBOOK", "WHATSAPP"] as const;
export const connectionStatusEnum = [
  "DISCONNECTED",
  "CONNECTED",
  "ERROR",
] as const;
export const unitScopeEnum = ["SYSTEM", "STORE"] as const;
export const memberBranchAccessModeEnum = ["ALL", "SELECTED"] as const;
export const branchSharingModeEnum = [
  "MAIN",
  "BALANCED",
  "FULL_SYNC",
  "INDEPENDENT",
] as const;

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdBy: text("created_by"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    passwordUpdatedAt: text("password_updated_at"),
    systemRole: text("system_role", {
      enum: ["USER", "SUPERADMIN", "SYSTEM_ADMIN"],
    })
      .notNull()
      .default("USER"),
    canCreateStores: integer("can_create_stores", { mode: "boolean" }),
    maxStores: integer("max_stores"),
    canCreateBranches: integer("can_create_branches", { mode: "boolean" }),
    maxBranchesPerStore: integer("max_branches_per_store"),
    sessionLimit: integer("session_limit"),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    usersCreatedByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [table.id],
      name: "users_created_by_fk",
    }).onDelete("set null"),
    usersEmailUnique: uniqueIndex("users_email_unique").on(table.email),
    usersCreatedByIdx: index("users_created_by_idx").on(table.createdBy),
    usersMustChangePasswordIdx: index("users_must_change_password_idx").on(
      table.mustChangePassword,
    ),
    usersCreatedAtIdx: index("users_created_at_idx").on(table.createdAt),
  }),
);

export const stores = sqliteTable(
  "stores",
  {
    id: id(),
    name: text("name").notNull(),
    logoName: text("logo_name"),
    logoUrl: text("logo_url"),
    address: text("address"),
    phoneNumber: text("phone_number"),
    storeType: text("store_type", { enum: storeTypeEnum })
      .notNull()
      .default("ONLINE_RETAIL"),
    currency: text("currency", { enum: storeCurrencyEnum }).notNull().default("LAK"),
    supportedCurrencies: text("supported_currencies").notNull().default("[\"LAK\"]"),
    vatEnabled: integer("vat_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    vatRate: integer("vat_rate").notNull().default(700),
    vatMode: text("vat_mode", { enum: storeVatModeEnum })
      .notNull()
      .default("EXCLUSIVE"),
    maxBranchesOverride: integer("max_branches_override"),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    storesCreatedAtIdx: index("stores_created_at_idx").on(table.createdAt),
  }),
);

export const systemConfig = sqliteTable("system_config", {
  id: text("id").primaryKey().notNull().default("global"),
  defaultCanCreateBranches: integer("default_can_create_branches", { mode: "boolean" })
    .notNull()
    .default(true),
  defaultMaxBranchesPerStore: integer("default_max_branches_per_store").default(1),
  defaultSessionLimit: integer("default_session_limit").notNull().default(1),
  paymentMaxAccountsPerStore: integer("payment_max_accounts_per_store")
    .notNull()
    .default(5),
  paymentRequireSlipForLaoQr: integer("payment_require_slip_for_lao_qr", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  storeLogoMaxSizeMb: integer("store_logo_max_size_mb").notNull().default(5),
  storeLogoAutoResize: integer("store_logo_auto_resize", { mode: "boolean" })
    .notNull()
    .default(true),
  storeLogoResizeMaxWidth: integer("store_logo_resize_max_width").notNull().default(1280),
  createdAt: text("created_at").notNull().default(createdAtDefault),
  updatedAt: text("updated_at").notNull().default(createdAtDefault),
});

export const storeTypeTemplates = sqliteTable(
  "store_type_templates",
  {
    storeType: text("store_type", { enum: storeTypeEnum }).primaryKey().notNull(),
    appLayout: text("app_layout").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull(),
    createdAt: text("created_at").notNull().default(createdAtDefault),
    updatedAt: text("updated_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    storeTypeTemplatesLayoutIdx: index("store_type_templates_app_layout_idx").on(table.appLayout),
  }),
);

export const storeBranches = sqliteTable(
  "store_branches",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    sourceBranchId: text("source_branch_id"),
    sharingMode: text("sharing_mode", { enum: branchSharingModeEnum }),
    sharingConfig: text("sharing_config"),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    storeBranchesSourceBranchFk: foreignKey({
      columns: [table.sourceBranchId],
      foreignColumns: [table.id],
      name: "store_branches_source_branch_fk",
    }).onDelete("set null"),
    storeBranchesStoreIdIdx: index("store_branches_store_id_idx").on(table.storeId),
    storeBranchesSourceBranchIdIdx: index("store_branches_source_branch_id_idx").on(
      table.sourceBranchId,
    ),
    storeBranchesStoreCreatedAtIdx: index("store_branches_store_created_at_idx").on(
      table.storeId,
      table.createdAt,
    ),
    storeBranchesStoreNameUnique: uniqueIndex("store_branches_store_name_unique").on(
      table.storeId,
      table.name,
    ),
    storeBranchesStoreCodeUnique: uniqueIndex("store_branches_store_code_unique").on(
      table.storeId,
      table.code,
    ),
  }),
);

export const storePaymentAccounts = sqliteTable(
  "store_payment_accounts",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    accountType: text("account_type", { enum: paymentAccountTypeEnum }).notNull(),
    bankName: text("bank_name"),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number"),
    qrImageUrl: text("qr_image_url"),
    promptpayId: text("promptpay_id"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(createdAtDefault),
    updatedAt: text("updated_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    storePaymentAccountsStoreIdIdx: index("store_payment_accounts_store_id_idx").on(
      table.storeId,
    ),
    storePaymentAccountsStoreActiveIdx: index("store_payment_accounts_store_active_idx").on(
      table.storeId,
      table.isActive,
    ),
    storePaymentAccountsStoreDefaultUnique: uniqueIndex(
      "store_payment_accounts_store_default_unique",
    )
      .on(table.storeId)
      .where(sql`${table.isDefault} = 1 and ${table.isActive} = 1`),
  }),
);

export const permissions = sqliteTable(
  "permissions",
  {
    id: id(),
    key: text("key").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
  },
  (table) => ({
    permissionsKeyUnique: uniqueIndex("permissions_key_unique").on(table.key),
    permissionsResourceActionUnique: uniqueIndex(
      "permissions_resource_action_unique",
    ).on(table.resource, table.action),
  }),
);

export const roles = sqliteTable(
  "roles",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isSystem: integer("is_system", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    rolesStoreIdIdx: index("roles_store_id_idx").on(table.storeId),
    rolesCreatedAtIdx: index("roles_created_at_idx").on(table.createdAt),
    rolesStoreNameUnique: uniqueIndex("roles_store_name_unique").on(
      table.storeId,
      table.name,
    ),
  }),
);

export const storeMembers = sqliteTable(
  "store_members",
  {
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    status: text("status", { enum: memberStatusEnum }).notNull().default("ACTIVE"),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storeId, table.userId] }),
    storeMembersStoreIdIdx: index("store_members_store_id_idx").on(table.storeId),
    storeMembersRoleIdIdx: index("store_members_role_id_idx").on(table.roleId),
    storeMembersAddedByIdx: index("store_members_added_by_idx").on(table.addedBy),
    storeMembersCreatedAtIdx: index("store_members_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export const storeMemberBranches = sqliteTable(
  "store_member_branches",
  {
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => storeBranches.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storeId, table.userId, table.branchId] }),
    storeMemberBranchesStoreUserIdx: index("store_member_branches_store_user_idx").on(
      table.storeId,
      table.userId,
    ),
    storeMemberBranchesBranchIdx: index("store_member_branches_branch_idx").on(
      table.branchId,
    ),
  }),
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
    rolePermissionsRoleIdIdx: index("role_permissions_role_id_idx").on(table.roleId),
  }),
);

export const units = sqliteTable(
  "units",
  {
    id: id(),
    code: text("code").notNull(),
    nameTh: text("name_th").notNull(),
    scope: text("scope", { enum: unitScopeEnum }).notNull().default("SYSTEM"),
    storeId: text("store_id").references(() => stores.id, { onDelete: "cascade" }),
  },
  (table) => ({
    unitsStoreIdIdx: index("units_store_id_idx").on(table.storeId),
    unitsSystemCodeUnique: uniqueIndex("units_system_code_unique")
      .on(table.code)
      .where(sql`${table.scope} = 'SYSTEM'`),
    unitsStoreCodeUnique: uniqueIndex("units_store_code_unique")
      .on(table.storeId, table.code)
      .where(sql`${table.scope} = 'STORE'`),
  }),
);

export const products = sqliteTable(
  "products",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    barcode: text("barcode"),
    baseUnitId: text("base_unit_id")
      .notNull()
      .references(() => units.id),
    priceBase: integer("price_base").notNull(),
    costBase: integer("cost_base").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    productsStoreIdIdx: index("products_store_id_idx").on(table.storeId),
    productsCreatedAtIdx: index("products_created_at_idx").on(table.createdAt),
    productsStoreSkuUnique: uniqueIndex("products_store_sku_unique").on(
      table.storeId,
      table.sku,
    ),
  }),
);

export const productUnits = sqliteTable(
  "product_units",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    multiplierToBase: integer("multiplier_to_base").notNull(),
  },
  (table) => ({
    productUnitsProductIdIdx: index("product_units_product_id_idx").on(
      table.productId,
    ),
    productUnitsUnique: uniqueIndex("product_units_unique").on(
      table.productId,
      table.unitId,
    ),
  }),
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: contactChannelEnum }).notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    lastInboundAt: text("last_inbound_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    contactsStoreIdIdx: index("contacts_store_id_idx").on(table.storeId),
    contactsCreatedAtIdx: index("contacts_created_at_idx").on(table.createdAt),
  }),
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: text("type", { enum: movementTypeEnum }).notNull(),
    qtyBase: integer("qty_base").notNull(),
    refType: text("ref_type", { enum: movementRefTypeEnum }).notNull(),
    refId: text("ref_id"),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    inventoryMovementsStoreIdIdx: index("inventory_movements_store_id_idx").on(
      table.storeId,
    ),
    inventoryMovementsProductIdIdx: index(
      "inventory_movements_product_id_idx",
    ).on(table.productId),
    inventoryMovementsCreatedAtIdx: index(
      "inventory_movements_created_at_idx",
    ).on(table.createdAt),
  }),
);

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderNo: text("order_no").notNull(),
    channel: text("channel", { enum: orderChannelEnum })
      .notNull()
      .default("WALK_IN"),
    status: text("status", { enum: orderStatusEnum })
      .notNull()
      .default("DRAFT"),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    vatAmount: integer("vat_amount").notNull().default(0),
    shippingFeeCharged: integer("shipping_fee_charged").notNull().default(0),
    total: integer("total").notNull().default(0),
    paymentCurrency: text("payment_currency", { enum: storeCurrencyEnum })
      .notNull()
      .default("LAK"),
    paymentMethod: text("payment_method", { enum: orderPaymentMethodEnum })
      .notNull()
      .default("CASH"),
    paymentAccountId: text("payment_account_id").references(() => storePaymentAccounts.id, {
      onDelete: "set null",
    }),
    paymentSlipUrl: text("payment_slip_url"),
    paymentProofSubmittedAt: text("payment_proof_submitted_at"),
    shippingCarrier: text("shipping_carrier"),
    trackingNo: text("tracking_no"),
    shippingCost: integer("shipping_cost").notNull().default(0),
    paidAt: text("paid_at"),
    shippedAt: text("shipped_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    ordersStoreIdIdx: index("orders_store_id_idx").on(table.storeId),
    ordersOrderNoIdx: index("orders_order_no_idx").on(table.orderNo),
    ordersCreatedAtIdx: index("orders_created_at_idx").on(table.createdAt),
    ordersStoreCreatedAtIdx: index("orders_store_created_at_idx").on(
      table.storeId,
      table.createdAt,
    ),
    ordersStoreStatusCreatedAtIdx: index(
      "orders_store_status_created_at_idx",
    ).on(table.storeId, table.status, table.createdAt),
    ordersStoreStatusPaidAtIdx: index("orders_store_status_paid_at_idx").on(
      table.storeId,
      table.status,
      table.paidAt,
    ),
    ordersStorePaymentMethodIdx: index("orders_store_payment_method_idx").on(
      table.storeId,
      table.paymentMethod,
    ),
    ordersStoreStatusChannelIdx: index("orders_store_status_channel_idx").on(
      table.storeId,
      table.status,
      table.channel,
    ),
    ordersStoreOrderNoUnique: uniqueIndex("orders_store_order_no_unique").on(
      table.storeId,
      table.orderNo,
    ),
  }),
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    qtyBase: integer("qty_base").notNull(),
    priceBaseAtSale: integer("price_base_at_sale").notNull(),
    costBaseAtSale: integer("cost_base_at_sale").notNull(),
    lineTotal: integer("line_total").notNull(),
  },
  (table) => ({
    orderItemsOrderIdIdx: index("order_items_order_id_idx").on(table.orderId),
    orderItemsProductIdIdx: index("order_items_product_id_idx").on(table.productId),
  }),
);

export const fbConnections = sqliteTable(
  "fb_connections",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: text("status", { enum: connectionStatusEnum })
      .notNull()
      .default("DISCONNECTED"),
    pageName: text("page_name"),
    pageId: text("page_id"),
    connectedAt: text("connected_at"),
  },
  (table) => ({
    fbConnectionsStoreIdIdx: index("fb_connections_store_id_idx").on(
      table.storeId,
    ),
  }),
);

export const waConnections = sqliteTable(
  "wa_connections",
  {
    id: id(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: text("status", { enum: connectionStatusEnum })
      .notNull()
      .default("DISCONNECTED"),
    phoneNumber: text("phone_number"),
    connectedAt: text("connected_at"),
  },
  (table) => ({
    waConnectionsStoreIdIdx: index("wa_connections_store_id_idx").on(
      table.storeId,
    ),
  }),
);
