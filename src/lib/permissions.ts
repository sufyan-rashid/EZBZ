export type PermissionAction = "view" | "add" | "edit" | "delete";
export type FeaturePermissions = Partial<Record<PermissionAction, boolean>>;
export type GranularPermissions = Record<string, FeaturePermissions | undefined>;

// Which actions are meaningful for each feature. Only these render as
// checkboxes in the Team invite/edit screens, and only these are ever checked.
export const FEATURE_ACTIONS: Record<string, PermissionAction[]> = {
  dashboard: ["view"],
  orders: ["view", "add", "edit", "delete"],
  customers: ["view", "add", "edit", "delete"],
  products: ["view", "add", "edit", "delete"],
  inventory: ["view", "edit"],
  expenses: ["view", "add", "edit", "delete"],
  reports: ["view"],
  returns: ["view", "add"],
  team: ["view", "add", "edit", "delete"],
  settings: ["view", "edit"],
  data: ["view"],
};

export const FEATURE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  customers: "Customers",
  products: "Products",
  inventory: "Inventory",
  expenses: "Expenses",
  reports: "Reports",
  returns: "Returns",
  team: "Team",
  settings: "Business Settings",
  data: "Data",
};

export function can(
  permissions: GranularPermissions | undefined | null,
  feature: string,
  action: PermissionAction,
): boolean {
  return !!permissions?.[feature]?.[action];
}

export function fullAccessPermissions(): GranularPermissions {
  const result: GranularPermissions = {};
  for (const feature of Object.keys(FEATURE_ACTIONS)) {
    const entry: FeaturePermissions = {};
    for (const action of FEATURE_ACTIONS[feature]) entry[action] = true;
    result[feature] = entry;
  }
  return result;
}

export function countGrantedActions(permissions: GranularPermissions | undefined | null): number {
  if (!permissions) return 0;
  let count = 0;
  for (const feature of Object.values(permissions)) {
    if (!feature) continue;
    count += Object.values(feature).filter(Boolean).length;
  }
  return count;
}

export function getLandingRoute(permissions: GranularPermissions | undefined | null): any {
  if (can(permissions, "dashboard", "view")) return "/(app)/dashboard";
  if (can(permissions, "orders", "view")) return "/(app)/orders";
  if (can(permissions, "customers", "view")) return "/(app)/customers";
  return "/(app)/products";
}
