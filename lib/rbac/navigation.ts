import { isPermissionGranted } from "@/lib/rbac/access";

const preferredRoutesByPermission: Array<{ permissionKey: string; href: string }> = [
  { permissionKey: "dashboard.view", href: "/dashboard" },
  { permissionKey: "orders.view", href: "/orders" },
  { permissionKey: "inventory.view", href: "/stock" },
  { permissionKey: "products.view", href: "/products" },
  { permissionKey: "settings.view", href: "/settings" },
  { permissionKey: "reports.view", href: "/reports" },
];

export function getPreferredAuthorizedRoute(permissionKeys: string[]) {
  const match = preferredRoutesByPermission.find((item) =>
    isPermissionGranted(permissionKeys, item.permissionKey),
  );

  return match?.href ?? null;
}
