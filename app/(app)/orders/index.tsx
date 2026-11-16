import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { SearchInput } from "../../../src/components/search-input";
import { Button } from "../../../src/components/button";
import { can } from "../../../src/lib/permissions";
import { formatCurrency } from "../../../src/lib/currency";
import { theme } from "../../../src/lib/theme";

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  amount_paid: number;
  credited_amount: number;
  created_at: string;
  customers: { name: string } | null;
};

export default function OrdersList() {
  const { business, permissions } = useBusiness();
  const { pendingOrderCount, pendingOrderTotal } = useOfflineSync();
  const router = useRouter();
  const canAdd = can(permissions, "orders", "add");
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!business) return;
    let query = supabase
      .from("orders")
      .select("id, order_number, status, total, amount_paid, credited_amount, created_at, customers(name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });
    if (search.trim()) {
      query = query.ilike("order_number", `%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) console.log("Error fetching orders:", error.message);
    setOrders((data as any) ?? []);
  }, [business?.id, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!can(permissions, "orders", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view orders.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SearchInput style={styles.search} placeholder="Search order number..." value={search} onChangeText={setSearch} />
        {canAdd && (
          <Button title="+ New" size="sm" onPress={() => router.push("/(app)/orders/new")} />
        )}
      </View>
      {pendingOrderCount > 0 && (
        <Pressable style={styles.pendingBanner} onPress={() => router.push("/(app)/more/pending-sync")}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingOrderCount} sale{pendingOrderCount === 1 ? "" : "s"} waiting to sync
            {pendingOrderTotal > 0 ? ` (~${formatCurrency(pendingOrderTotal)})` : ""} — tap to review
          </Text>
        </Pressable>
      )}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No orders yet.</Text>
            {canAdd && (
              <Button title="Create Order" onPress={() => router.push("/(app)/orders/new")} />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const due = Math.max(0, item.total - item.amount_paid - Number(item.credited_amount ?? 0));
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/(app)/orders/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNumber}>{item.order_number}</Text>
                <Text style={styles.customerName}>{item.customers?.name ?? "Walk-in"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.total}>{formatCurrency(item.total)}</Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        item.status === "cancelled"
                          ? theme.colors.muted
                          : due > 0
                            ? theme.colors.warning
                            : theme.colors.success,
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {item.status === "cancelled" ? "Cancelled" : due > 0 ? `Due ${formatCurrency(due)}` : "Paid"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  search: {
    marginRight: theme.spacing.sm,
  },
  pendingBanner: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  pendingBannerText: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 12 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  orderNumber: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  customerName: { color: theme.colors.muted, marginTop: 2 },
  total: { color: theme.colors.text, fontWeight: "600", marginBottom: 4 },
  badge: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  empty: { alignItems: "center", marginTop: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, marginBottom: theme.spacing.md },
});
