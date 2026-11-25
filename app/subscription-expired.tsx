import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSubscription } from "../src/hooks/useSubscription";
import { useBusiness } from "../src/hooks/useBusiness";
import { supabase } from "../src/lib/supabase";
import { showAlert } from "../src/lib/alert";
import { openSupportWhatsApp } from "../src/lib/support";
import { Button } from "../src/components/button";
import { theme } from "../src/lib/theme";

export default function SubscriptionExpired() {
  const { subscription, effectiveStatus, isActive, refreshSubscription } = useSubscription();
  const { business, isPlatformAdmin, memberships } = useBusiness();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isActive) {
      router.replace("/(app)/dashboard");
    }
  }, [isActive]);

  function handleRenew() {
    openSupportWhatsApp(
      `Hi, I'd like to renew my EZBZ subscription for "${business?.name ?? "my business"}".`,
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refreshSubscription();
    setRefreshing(false);
  }

  async function handleActivateTestSubscription() {
    if (!business) return;
    const { error } = await supabase.rpc("activate_test_subscription", {
      p_business_id: business.id,
      p_days: 30,
    });
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    await refreshSubscription();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your subscription has expired</Text>
      <Text style={styles.subtitle}>Your business data is safe.</Text>

      <View style={styles.card}>
        <Text style={styles.row}>
          Status: {effectiveStatus}
        </Text>
        <Text style={styles.row}>
          Expiry:{" "}
          {subscription?.expiry_date
            ? new Date(subscription.expiry_date).toLocaleDateString()
            : "Not activated yet"}
        </Text>
      </View>

      <Button title="Contact Us to Renew" onPress={handleRenew} style={{ marginBottom: theme.spacing.md }} />

      <Button
        title={refreshing ? "Checking..." : "I've Paid — Refresh"}
        variant="outline"
        loading={refreshing}
        onPress={handleRefresh}
        style={{ marginBottom: theme.spacing.md }}
      />

      {isPlatformAdmin && (
        <Button
          title="Admin: Activate 30-day test subscription"
          onPress={handleActivateTestSubscription}
          style={{ backgroundColor: theme.colors.warning, marginBottom: theme.spacing.md }}
        />
      )}

      {memberships.length > 1 && (
        <Pressable
          style={styles.logoutButton}
          onPress={() => router.push("/(onboarding)/select-business")}
        >
          <Text style={styles.switchText}>Switch to another business</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.logoutButton}
        onPress={() => supabase.auth.signOut()}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.muted,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: { color: theme.colors.text, marginBottom: theme.spacing.xs },
  logoutButton: { padding: theme.spacing.sm, alignItems: "center" },
  logoutText: { color: theme.colors.error, fontWeight: "600" },
  switchText: { color: theme.colors.secondary, fontWeight: "600" },
});
