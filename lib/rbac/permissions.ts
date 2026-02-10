export type Role = "owner" | "manager" | "cashier";

export type Permission =
  | "orders:read"
  | "orders:manage"
  | "products:read"
  | "products:manage"
  | "users:manage";

const rolePermissions: Record<Role, Permission[]> = {
  owner: [
    "orders:read",
    "orders:manage",
    "products:read",
    "products:manage",
    "users:manage",
  ],
  manager: ["orders:read", "orders:manage", "products:read", "products:manage"],
  cashier: ["orders:read", "orders:manage", "products:read"],
};

export const hasPermission = (role: Role, permission: Permission) =>
  rolePermissions[role].includes(permission);

export const getPermissions = (role: Role) => rolePermissions[role];
