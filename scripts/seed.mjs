import { createClient } from "@libsql/client";
import { scryptSync } from "node:crypto";

const databaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";

const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url: databaseUrl,
  authToken,
});

const demoSalt = "seed_demo_salt";
const demoPasswordHash = `${demoSalt}:${scryptSync("password123", demoSalt, 64).toString("hex")}`;

const permissionSeed = [
  ["stores", "view"],
  ["stores", "update"],
  ["members", "view"],
  ["members", "manage"],
  ["rbac.roles", "view"],
  ["rbac.roles", "manage"],
  ["rbac.permissions", "view"],
  ["rbac.permissions", "manage"],
  ["products", "view"],
  ["products", "create"],
  ["products", "update"],
  ["products", "archive"],
  ["products", "price.update"],
  ["units", "view"],
  ["units", "manage"],
  ["inventory", "view"],
  ["inventory", "in"],
  ["inventory", "out"],
  ["inventory", "adjust"],
  ["inventory", "reserve"],
  ["inventory", "release"],
  ["orders", "view"],
  ["orders", "create"],
  ["orders", "update"],
  ["orders", "cancel"],
  ["orders", "mark_paid"],
  ["orders", "pack"],
  ["orders", "ship"],
  ["contacts", "view"],
  ["contacts", "create"],
  ["contacts", "update"],
  ["connections", "view"],
  ["connections", "manage"],
  ["reports", "view"],
  ["reports", "export"],
];

const rolePermissionMap = {
  Owner: "ALL",
  Manager: [
    "stores.view",
    "stores.update",
    "members.view",
    "products.view",
    "products.create",
    "products.update",
    "products.archive",
    "products.price.update",
    "units.view",
    "units.manage",
    "inventory.view",
    "inventory.in",
    "inventory.out",
    "inventory.adjust",
    "inventory.reserve",
    "inventory.release",
    "orders.view",
    "orders.create",
    "orders.update",
    "orders.cancel",
    "orders.mark_paid",
    "orders.pack",
    "orders.ship",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "connections.view",
    "connections.manage",
    "reports.view",
    "reports.export",
    "rbac.roles.view",
  ],
  Staff: [
    "products.view",
    "units.view",
    "inventory.view",
    "inventory.out",
    "inventory.reserve",
    "inventory.release",
    "orders.view",
    "orders.create",
    "orders.update",
    "orders.mark_paid",
    "orders.pack",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "reports.view",
  ],
  Viewer: ["reports.view"],
};

const keyFor = (resource, action) => `${resource}.${action}`;
const idForPermission = (key) =>
  `perm_${key.replace(/[^a-zA-Z0-9]/g, "_")}`;

async function insertPermissions() {
  for (const [resource, action] of permissionSeed) {
    const key = keyFor(resource, action);
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO permissions (id, key, resource, action)
        VALUES (?, ?, ?, ?)
      `,
      args: [idForPermission(key), key, resource, action],
    });
  }
}

async function insertStoreAndOwner() {
  let ownerUserId = "user_owner_demo";
  const storeId = "store_demo_main";

  await db.execute({
    sql: `
      INSERT INTO users (id, email, name, password_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash
    `,
    args: [ownerUserId, "owner@demo-pos.local", "เจ้าของร้านเดโม", demoPasswordHash],
  });

  const ownerUserRow = await db.execute({
    sql: `SELECT id FROM users WHERE email = ? LIMIT 1`,
    args: ["owner@demo-pos.local"],
  });
  if (ownerUserRow.rows[0]?.id) {
    ownerUserId = String(ownerUserRow.rows[0].id);
  }

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO stores (id, name, store_type, currency, vat_enabled, vat_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [storeId, "Demo POS Store", "ONLINE_RETAIL", "LAK", 1, 700],
  });

  return { ownerUserId, storeId };
}

async function insertRoles(storeId, ownerUserId) {
  const roles = ["Owner", "Manager", "Staff", "Viewer"];

  for (const roleName of roles) {
    const roleId = `role_${storeId}_${roleName.toLowerCase()}`;
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO roles (id, store_id, name, is_system)
        VALUES (?, ?, ?, ?)
      `,
      args: [roleId, storeId, roleName, 1],
    });
  }

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO store_members (store_id, user_id, role_id, status)
      VALUES (?, ?, ?, ?)
    `,
    args: [storeId, ownerUserId, `role_${storeId}_owner`, "ACTIVE"],
  });

  for (const roleName of roles) {
    const roleId = `role_${storeId}_${roleName.toLowerCase()}`;
    const permissionKeys =
      rolePermissionMap[roleName] === "ALL"
        ? permissionSeed.map(([resource, action]) => keyFor(resource, action))
        : rolePermissionMap[roleName];

    for (const key of permissionKeys) {
      await db.execute({
        sql: `
          INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
          VALUES (?, ?)
        `,
        args: [roleId, idForPermission(key)],
      });
    }
  }
}

async function insertUnitsProductsInventory(storeId, ownerUserId) {
  const units = [
    ["unit_ea", "EA", "ชิ้น"],
    ["unit_pack", "PACK", "แพ็ก"],
    ["unit_box", "BOX", "กล่อง"],
  ];

  for (const [id, code, nameTh] of units) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO units (id, code, name_th) VALUES (?, ?, ?)`,
      args: [id, code, nameTh],
    });
  }

  const products = [
    [
      "prd_iced_coffee",
      "ICD-001",
      "กาแฟเย็น",
      "8850000000001",
      "unit_ea",
      6500,
      3200,
    ],
    [
      "prd_thai_tea",
      "ICD-002",
      "ชาไทย",
      "8850000000002",
      "unit_ea",
      6000,
      2800,
    ],
    [
      "prd_tuna_sandwich",
      "SNK-101",
      "แซนด์วิชทูน่า",
      "8850000000101",
      "unit_ea",
      8900,
      4500,
    ],
  ];

  for (const [id, sku, name, barcode, baseUnitId, priceBase, costBase] of products) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO products
          (id, store_id, sku, name, barcode, base_unit_id, price_base, cost_base, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [id, storeId, sku, name, barcode, baseUnitId, priceBase, costBase, 1],
    });
  }

  const productUnits = [
    ["pu_icd001_ea", "prd_iced_coffee", "unit_ea", 1],
    ["pu_icd001_pack", "prd_iced_coffee", "unit_pack", 12],
    ["pu_icd002_ea", "prd_thai_tea", "unit_ea", 1],
    ["pu_icd002_box", "prd_thai_tea", "unit_box", 24],
    ["pu_snk101_ea", "prd_tuna_sandwich", "unit_ea", 1],
  ];

  for (const [id, productId, unitId, multiplier] of productUnits) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO product_units
          (id, product_id, unit_id, multiplier_to_base)
        VALUES (?, ?, ?, ?)
      `,
      args: [id, productId, unitId, multiplier],
    });
  }

  const openingMovements = [
    ["imv_open_icd001", "prd_iced_coffee", 120],
    ["imv_open_icd002", "prd_thai_tea", 80],
    ["imv_open_snk101", "prd_tuna_sandwich", 40],
  ];

  for (const [id, productId, qtyBase] of openingMovements) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO inventory_movements
          (id, store_id, product_id, type, qty_base, ref_type, ref_id, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        storeId,
        productId,
        "IN",
        qtyBase,
        "MANUAL",
        "seed-opening-stock",
        "ยอดยกมาเริ่มต้น",
        ownerUserId,
      ],
    });
  }
}

async function insertContacts(storeId) {
  const contactRows = [
    [
      "contact_fb_001",
      "FACEBOOK",
      "คุณมินตรา",
      "02099887766",
      "ลูกค้าประจำช่องทาง Facebook",
    ],
    [
      "contact_wa_001",
      "WHATSAPP",
      "บริษัท Lao Supply",
      "02011223344",
      "สั่งซื้อจำนวนมากทุกสัปดาห์",
    ],
  ];

  for (const [id, channel, displayName, phone, notes] of contactRows) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO contacts
          (id, store_id, channel, display_name, phone, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [id, storeId, channel, displayName, phone, notes],
    });
  }
}

async function summarize(storeId) {
  const productsCount = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM products WHERE store_id = ?`,
    args: [storeId],
  });
  const contactsCount = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM contacts WHERE store_id = ?`,
    args: [storeId],
  });
  const activeMembersCount = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM store_members WHERE store_id = ? AND status = 'ACTIVE'`,
    args: [storeId],
  });

  console.log("Seed completed");
  console.log(`- store_id: ${storeId}`);
  console.log(`- active_members: ${Number(activeMembersCount.rows[0].count)}`);
  console.log(`- products: ${Number(productsCount.rows[0].count)}`);
  console.log(`- contacts: ${Number(contactsCount.rows[0].count)}`);
}

async function main() {
  const { ownerUserId, storeId } = await insertStoreAndOwner();
  await insertPermissions();
  await insertRoles(storeId, ownerUserId);
  await insertUnitsProductsInventory(storeId, ownerUserId);
  await insertContacts(storeId);
  await summarize(storeId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
