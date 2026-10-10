import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../../src/hooks/useAuth";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import {
  getPendingOrders,
  getPendingReturns,
  getPendingCustomers,
  getPendingCustomerPayments,
  removePendingOrder,
  removePendingReturn,
  removePendingCustomer,
  removePendingCustomerPayment,
  PendingItem,
  PendingOrderPayload,
  PendingReturnPayload,
  PendingCustomerPayload,
  PendingCustomerPaymentPayload,
} from "../../../src/lib/offlineQueue";
import { showAlert } from "../../../src/lib/alert";
import { formatCurrency } from "../../../src/lib/currency";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

export default function PendingSync() {
  const { session } = useAuth();
  const { business } = useBusiness();
  const { isConnected } = useNetwork();
  const { syncing, triggerSync, refresh: refreshBadge } = useOfflineSync();
  const [orders, setOrders] = useState<PendingItem<PendingOrderPayload>[]>([]);
  const [returns, setReturns] = useState<PendingItem<PendingReturnPayload>[]>([]);
  const [customers, setCustomers] = useState<PendingItem<PendingCustomerPayload>[]>([]);
  const [payments, setPayments] = useState<PendingItem<PendingCustomerPaymentPayload>[]>([]);

  const load = useCallback(async () => {
    if (!business || !session) return;
    const [o, r, c, p] = await Promise.all([
      getPendingOrders(business.id, session.user.id),
      getPendingReturns(business.id, session.user.id),
      getPendingCustomers(business.id, session.user.id),
      getPendingCustomerPayments(business.id, session.user.id),
    ]);
    setOrders(o.filter((i) => i.status !== "synced"));
    setReturns(r.filter((i) => i.status !== "synced"));
    setCustomers(c.filter((i) => i.status !== "synced"));
    setPayments(p.filter((i) => i.status !== "synced"));
  }, [business?.id, session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSyncNow() {
    await triggerSync();
    await load();
  }

  function handleDiscardOrder(item: PendingItem<PendingOrderPayload>) {
    showAlert(
      "Discard this sale?",
      `${item.local_label} (${formatCurrency(item.payload.totalEstimate)}) will be permanently deleted and never sent to the server. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (!business || !session) return;
            await removePendingOrder(business.id, session.user.id, item.local_id);
            await load();
            await refreshBadge();
          },
        },
      ],
    );
  }

  function handleDiscardReturn(item: PendingItem<PendingReturnPayload>) {
    showAlert(
      "Discard this return?",
      `${item.local_label} will be permanently deleted and never sent to the server. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (!business || !session) return;
            await removePendingReturn(business.id, session.user.id, item.local_id);
            await load();
            await refreshBadge();
          },
        },
      ],
    );
  }

  function handleDiscardCustomer(item: PendingItem<PendingCustomerPayload>) {
    showAlert(
      "Discard this customer?",
      `${item.local_label} will be permanently deleted and never sent to the server. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (!business || !session) return;
            await removePendingCustomer(business.id, session.user.id, item.local_id);
            await load();
            await refreshBadge();
          },
        },
      ],
    );
  }

  function handleDiscardPayment(item: PendingItem<PendingCustomerPaymentPayload>) {
    showAlert(
      "Discard this payment?",
      `${item.local_label} (${formatCurrency(item.payload.amount)}) will be permanently deleted and never sent to the server. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (!business || !session) return;
            await removePendingCustomerPayment(business.id, session.user.id, item.local_id);
            await load();
            await refreshBadge();
          },
        },
      ],
    );
  }

  const totalPending = orders.length + returns.length + customers.length + payments.length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        Sales and returns saved on this device while offline, waiting to be sent to the server.
      </Text>

      <Button
        title={syncing ? "Syncing..." : isConnected ? "Sync Now" : "Waiting for internet..."}
        onPress={handleSyncNow}
        loading={syncing}
        disabled={!isConnected || totalPending === 0}
        style={{ marginBottom: theme.spacing.lg }}
      />

      {totalPending === 0 ? (
        <Text style={styles.empty}>Nothing pending — everything is synced.</Text>
      ) : (
        <>
          {orders.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Orders ({orders.length})</Text>
              {orders.map((item) => (
                <View key={item.local_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardLabel}>{item.local_label}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.cardDetail}>
                    {item.payload.items.length} item{item.payload.items.length === 1 ? "" : "s"} ·{" "}
                    {formatCurrency(item.payload.totalEstimate)} · {new Date(item.created_at).toLocaleString()}
                  </Text>
                  {item.error && <Text style={styles.errorText}>{item.error}</Text>}
                  {item.status === "failed" && (
                    <Button
                      title="Discard"
                      variant="outline"
                      size="sm"
                      style={{ borderColor: theme.colors.error, marginTop: theme.spacing.sm }}
                      textStyle={{ color: theme.colors.error }}
                      onPress={() => handleDiscardOrder(item)}
                    />
                  )}
                </View>
              ))}
            </>
          )}

          {returns.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Returns ({returns.length})</Text>
              {returns.map((item) => (
                <View key={item.local_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardLabel}>{item.local_label}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.cardDetail}>
                    {item.payload.items.length} item{item.payload.items.length === 1 ? "" : "s"} ·{" "}
                    {formatCurrency(item.payload.netEstimate)} (est.) · {new Date(item.created_at).toLocaleString()}
                  </Text>
                  {item.error && <Text style={styles.errorText}>{item.error}</Text>}
                  {item.status === "failed" && (
                    <Button
                      title="Discard"
                      variant="outline"
                      size="sm"
                      style={{ borderColor: theme.colors.error, marginTop: theme.spacing.sm }}
                      textStyle={{ color: theme.colors.error }}
                      onPress={() => handleDiscardReturn(item)}
                    />
                  )}
                </View>
              ))}
            </>
          )}

          {customers.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Customers ({customers.length})</Text>
              {customers.map((item) => (
                <View key={item.local_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardLabel}>{item.local_label}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.cardDetail}>
                    {item.payload.phone || "No phone"} · {new Date(item.created_at).toLocaleString()}
                  </Text>
                  {item.error && <Text style={styles.errorText}>{item.error}</Text>}
                  {item.status === "failed" && (
                    <Button
                      title="Discard"
                      variant="outline"
                      size="sm"
                      style={{ borderColor: theme.colors.error, marginTop: theme.spacing.sm }}
                      textStyle={{ color: theme.colors.error }}
                      onPress={() => handleDiscardCustomer(item)}
                    />
                  )}
                </View>
              ))}
            </>
          )}

          {payments.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Customer Payments ({payments.length})</Text>
              {payments.map((item) => (
                <View key={item.local_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardLabel}>{item.local_label}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.cardDetail}>
                    {formatCurrency(item.payload.amount)} · {new Date(item.created_at).toLocaleString()}
                  </Text>
                  {item.error && <Text style={styles.errorText}>{item.error}</Text>}
                  {item.status === "failed" && (
                    <Button
                      title="Discard"
                      variant="outline"
                      size="sm"
                      style={{ borderColor: theme.colors.error, marginTop: theme.spacing.sm }}
                      textStyle={{ color: theme.colors.error }}
                      onPress={() => handleDiscardPayment(item)}
                    />
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: theme.colors.warning },
    syncing: { label: "Syncing...", color: theme.colors.secondary },
    failed: { label: "Failed", color: theme.colors.error },
  };
  const info = map[status] ?? { label: status, color: theme.colors.muted };
  return (
    <View style={[styles.badge, { backgroundColor: info.color }]}>
      <Text style={styles.badgeText}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  intro: { color: theme.colors.muted, fontSize: 13, marginBottom: theme.spacing.md },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  cardDetail: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  errorText: { color: theme.colors.error, fontSize: 12, marginTop: theme.spacing.xs },
  badge: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 3 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
