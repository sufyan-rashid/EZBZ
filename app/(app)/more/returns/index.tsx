import { useCallback, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { useOfflineSync } from "../../../../src/hooks/useOfflineSync";
import { Button } from "../../../../src/components/button";
import { can } from "../../../../src/lib/permissions";
import { formatCurrency } from "../../../../src/lib/currency";
import { theme } from "../../../../src/lib/theme";

type ReturnRow = {
  id: string;
  return_number: string;
  net_amount: number;
  created_at: string;
  customers: { name: string } | null;
};

export default function ReturnsList() {
  const { business, permissions } = useBusiness();
  const { pendingReturnCount } = useOfflineSync();
  const router = useRouter();
  const canAdd = can(permissions, "returns", "add");
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business) return;
    const { data, error } = await supabase
      .from("returns")
      .select("id, return_number, net_amount, created_at, customers(name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });
    if (error) console.log("Error fetching returns:", error.message);
    setReturns((data as any) ?? []);
    setLoading(false);
  }, [business?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!can(permissions, "returns", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view returns.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {canAdd && (
        <Button
          title="+ New Return"
          onPress={() => router.push("/(app)/more/returns/new")}
          style={{ marginBottom: theme.spacing.lg }}
        />
      )}

      {pendingReturnCount > 0 && (
        <Pressable style={styles.pendingBanner} onPress={() => router.push("/(app)/more/pending-sync")}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingReturnCount} return{pendingReturnCount === 1 ? "" : "s"} waiting to sync — tap to review
          </Text>
        </Pressable>
      )}

      <FlatList
        data={returns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No returns yet.</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/(app)/more/returns/${item.id}`)}>
            <View>
              <Text style={styles.rowName}>
                {item.return_number} · {item.customers?.name ?? "Walk-in"}
              </Text>
              <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.rowAmount}>{formatCurrency(item.net_amount)}</Text>
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
  pendingBanner: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  pendingBannerText: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 12 },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  rowName: { color: theme.colors.text, fontWeight: "600" },
  rowDate: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  rowAmount: { color: theme.colors.warning, fontWeight: "700" },
});
