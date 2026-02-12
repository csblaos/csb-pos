import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
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

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    systemRole: text("system_role", {
      enum: ["USER", "SUPERADMIN", "SYSTEM_ADMIN"],
    })
      .notNull()
      .default("USER"),
    canCreateStores: integer("can_create_stores", { mode: "boolean" }),
    maxStores: integer("max_stores"),
    sessionLimit: integer("session_limit"),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    usersEmailUnique: uniqueIndex("users_email_unique").on(table.email),
    usersCreatedAtIdx: index("users_created_at_idx").on(table.createdAt),
  }),
);

export const stores = sqliteTable(
  "stores",
  {
    id: id(),
    name: text("name").notNull(),
    storeType: text("store_type", { enum: storeTypeEnum })
      .notNull()
      .default("ONLINE_RETAIL"),
    currency: text("currency").notNull().default("LAK"),
    vatEnabled: integer("vat_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    vatRate: integer("vat_rate").notNull().default(700),
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    storesCreatedAtIdx: index("stores_created_at_idx").on(table.createdAt),
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
    createdAt: text("created_at").notNull().default(createdAtDefault),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storeId, table.userId] }),
    storeMembersStoreIdIdx: index("store_members_store_id_idx").on(table.storeId),
    storeMembersRoleIdIdx: index("store_members_role_id_idx").on(table.roleId),
    storeMembersCreatedAtIdx: index("store_members_created_at_idx").on(
      table.createdAt,
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
  },
  (table) => ({
    unitsCodeUnique: uniqueIndex("units_code_unique").on(table.code),
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
