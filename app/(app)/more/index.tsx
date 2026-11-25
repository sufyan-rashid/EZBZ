import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { can } from "../../../src/lib/permissions";
import { theme } from "../../../src/lib/theme";

export default function More() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { permissions, memberships } = useBusiness();
  const { pendingOrderCount, pendingReturnCount, pendingCustomerCount, pendingPaymentCount } = useOfflineSync();
  const pendingTotal = pendingOrderCount + pendingReturnCount + pendingCustomerCount + pendingPaymentCount;

  function handleLogout() {
    showAlert("Log out?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  const groups = [
    {
      title: "Business",
      items: [
        {
          name: pendingTotal > 0 ? `Pending Sync (${pendingTotal})` : "Pending Sync",
          route: "/(app)/more/pending-sync",
          show: true,
        },
        { name: "Expenses", route: "/(app)/more/expenses", show: can(permissions, "expenses", "view") },
        { name: "Inventory", route: "/(app)/more/inventory", show: can(permissions, "inventory", "view") },
        { name: "Returns", route: "/(app)/more/returns", show: can(permissions, "returns", "view") },
        { name: "Reports", route: "/(app)/more/reports", show: can(permissions, "reports", "view") },
        { name: "Business Settings", route: "/(app)/more/settings", show: can(permissions, "settings", "view") },
        { name: "Data", route: "/(app)/more/data", show: can(permissions, "data", "view") },
      ],
    },
    {
      title: "Team & Access",
      items: [
        { name: "Team", route: "/(app)/more/team", show: can(permissions, "team", "view") },
      ],
    },
    {
      title: "Account",
      items: [
        { name: "My Account", route: "/(app)/more/account", show: true },
        {
          name: memberships.length > 1 ? "Switch Business" : "My Businesses",
          route: "/(onboarding)/select-business",
          show: true,
        },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
    .filter((group) => group.items.length > 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        padding: theme.spacing.lg,
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: theme.spacing.xl,
      }}
    >
      <Text style={styles.title}>More</Text>
      {groups.length === 0 ? (
        <Text style={styles.empty}>Ask your business owner for access to more sections.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item) => (
                <Pressable key={item.name} style={styles.row} onPress={() => router.push(item.route as any)}>
                  <Text style={styles.rowText}>{item.name}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.lg },
  group: { marginBottom: theme.spacing.lg },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowText: { color: theme.colors.text, fontSize: 16 },
  chevron: { color: theme.colors.muted, fontSize: 20 },
  empty: { color: theme.colors.muted },
  logoutButton: {
    padding: theme.spacing.md,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  logoutText: { color: theme.colors.error, fontWeight: "600" },
});
