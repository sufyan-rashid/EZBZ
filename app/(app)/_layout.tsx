import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { useBusiness } from "../../src/hooks/useBusiness";
import { useSubscription } from "../../src/hooks/useSubscription";
import { can } from "../../src/lib/permissions";
import { theme } from "../../src/lib/theme";

export default function AppLayout() {
  const { isActive, loading } = useSubscription();
  const { permissions } = useBusiness();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isActive) {
      router.replace("/subscription-expired");
    }
  }, [isActive, loading]);

  const canViewDashboard = can(permissions, "dashboard", "view");
  const canViewOrders = can(permissions, "orders", "view");
  const canViewCustomers = can(permissions, "customers", "view");
  const canViewProducts = can(permissions, "products", "view");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          href: canViewDashboard ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          href: canViewProducts ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetags-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          href: canViewOrders ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          href: canViewCustomers ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
