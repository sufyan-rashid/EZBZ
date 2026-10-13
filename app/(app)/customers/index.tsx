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

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  total_purchases: number;
  total_paid: number;
  total_due: number;
};

export default function CustomersList() {
  const { business, permissions } = useBusiness();
  const { pendingCustomerCount, pendingPaymentCount } = useOfflineSync();
  const router = useRouter();
  const canAdd = can(permissions, "customers", "add");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!business) return;
    const { data, error } = await supabase.rpc("get_customers_with_balance", {
      p_business_id: business.id,
    });
    if (error) console.log("Error fetching customers:", error.message);
    setCustomers(data ?? []);
  }, [business?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  if (!can(permissions, "customers", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view customers.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SearchInput style={styles.search} placeholder="Search name or phone..." value={search} onChangeText={setSearch} />
        {canAdd && <Button title="+ Add" size="sm" onPress={() => router.push("/(app)/customers/new")} />}
      </View>
      {pendingCustomerCount + pendingPaymentCount > 0 && (
        <Pressable style={styles.pendingBanner} onPress={() => router.push("/(app)/more/pending-sync")}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingCustomerCount > 0
              ? `${pendingCustomerCount} new customer${pendingCustomerCount === 1 ? "" : "s"}`
              : ""}
            {pendingCustomerCount > 0 && pendingPaymentCount > 0 ? " and " : ""}
            {pendingPaymentCount > 0
              ? `${pendingPaymentCount} payment${pendingPaymentCount === 1 ? "" : "s"}`
              : ""}{" "}
            waiting to sync — tap to review
          </Text>
        </Pressable>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No customers yet.</Text>
            {canAdd && <Button title="Add Customer" onPress={() => router.push("/(app)/customers/new")} />}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(app)/customers/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.phone ? <Text style={styles.detail}>{item.phone}</Text> : null}
            </View>
            {item.total_due > 0 ? (
              <Text style={styles.due}>Due {formatCurrency(item.total_due)}</Text>
            ) : (
              <Text style={styles.settled}>Settled</Text>
            )}
          </Pressable>
        )}
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
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  name: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  detail: { color: theme.colors.muted, marginTop: 2 },
  due: { color: theme.colors.warning, fontWeight: "700" },
  settled: { color: theme.colors.muted, fontSize: 12 },
  empty: { alignItems: "center", marginTop: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, marginBottom: theme.spacing.md },
});
