export type PermissionSeed = {
  resource: string;
  action: string;
};

const moduleActionResources = [
  "dashboard",
  "orders",
  "products",
  "inventory",
  "contacts",
  "members",
  "reports",
  "settings",
  "connections",
  "stores",
  "units",
  "rbac.roles",
  "rbac.permissions",
] as const;

const moduleActionActions = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "approve",
] as const;

const moduleActionPermissions: PermissionSeed[] = moduleActionResources.flatMap(
  (resource) => moduleActionActions.map((action) => ({ resource, action })),
);

const extraPermissions: PermissionSeed[] = [
  { resource: "products", action: "archive" },
  { resource: "products", action: "price.update" },
  { resource: "inventory", action: "in" },
  { resource: "inventory", action: "out" },
  { resource: "inventory", action: "adjust" },
  { resource: "inventory", action: "reserve" },
  { resource: "inventory", action: "release" },
  { resource: "orders", action: "mark_paid" },
  { resource: "orders", action: "pack" },
  { resource: "orders", action: "ship" },
];

const dedupe = <T>(items: T[], key: (item: T) => string) => {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }

  return [...map.values()];
};

export const defaultPermissionCatalog: PermissionSeed[] = dedupe(
  [...moduleActionPermissions, ...extraPermissions],
  (item) => `${item.resource}.${item.action}`,
);

export const permissionKey = (resource: string, action: string) =>
  `${resource}.${action}`;

export const permissionIdFromKey = (key: string) =>
  `perm_${key.replace(/[^a-zA-Z0-9]/g, "_")}`;

export const defaultRoleNames = ["Owner", "Manager", "Staff", "Viewer"] as const;

export type DefaultRoleName = (typeof defaultRoleNames)[number];

const keys = (resource: string, actions: string[]) =>
  actions.map((action) => permissionKey(resource, action));

export const defaultRolePermissions: Record<DefaultRoleName, "ALL" | string[]> = {
  Owner: "ALL",
  Manager: [
    ...keys("dashboard", ["view"]),
    ...keys("orders", ["view", "create", "update", "delete", "approve", "export"]),
    ...keys("products", ["view", "create", "update", "delete", "approve", "export"]),
    ...keys("inventory", ["view", "create", "update", "approve", "export"]),
    ...keys("contacts", ["view", "create", "update", "delete", "export"]),
    ...keys("members", ["view", "create", "update"]),
    ...keys("reports", ["view", "export"]),
    ...keys("settings", ["view", "update"]),
    ...keys("connections", ["view", "update"]),
    ...keys("stores", ["view", "update"]),
    ...keys("units", ["view", "create", "update", "delete"]),
    ...keys("rbac.roles", ["view"]),
    ...keys("rbac.permissions", ["view"]),
    "products.archive",
    "products.price.update",
    "inventory.in",
    "inventory.out",
    "inventory.adjust",
    "inventory.reserve",
    "inventory.release",
    "orders.mark_paid",
    "orders.pack",
    "orders.ship",
  ],
  Staff: [
    ...keys("dashboard", ["view"]),
    ...keys("orders", ["view", "create", "update"]),
    ...keys("products", ["view"]),
    ...keys("inventory", ["view", "create", "update"]),
    ...keys("contacts", ["view", "create", "update"]),
    ...keys("reports", ["view"]),
    ...keys("settings", ["view"]),
    ...keys("connections", ["view"]),
    ...keys("stores", ["view"]),
    ...keys("units", ["view"]),
    "inventory.out",
    "inventory.reserve",
    "inventory.release",
    "orders.mark_paid",
    "orders.pack",
  ],
  Viewer: [permissionKey("reports", "view")],
};
