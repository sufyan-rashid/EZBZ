import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useAuth } from "../../../src/hooks/useAuth";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { addPendingCustomerPayment, getQueuedPaymentTotalForCustomer } from "../../../src/lib/offlineQueue";
import { generateCustomerStatement, InvoiceFormat } from "../../../src/lib/invoice";
import { openWhatsApp } from "../../../src/lib/whatsapp";
import { can } from "../../../src/lib/permissions";
import { formatCurrency, exceedsAmount } from "../../../src/lib/currency";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  amount_paid: number;
  credited_amount: number;
  created_at: string;
};

function orderDue(o: Order): number {
  return Math.max(0, Number(o.total) - Number(o.amount_paid) - Number(o.credited_amount ?? 0));
}

export default function CustomerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { business, permissions } = useBusiness();
  const { isConnected } = useNetwork();
  const { refresh: refreshOfflineSync } = useOfflineSync();
  const canEdit = can(permissions, "customers", "edit");
  const canDelete = can(permissions, "customers", "delete");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [returnedTotal, setReturnedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [sharingStatement, setSharingStatement] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) console.log("Error fetching customer:", error.message);
    if (data) {
      setName(data.name);
      setPhone(data.phone ?? "");
      setEmail(data.email ?? "");
      setAddress(data.address ?? "");
      setNotes(data.notes ?? "");
    }
    const { data: orderData, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, status, total, amount_paid, credited_amount, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });
    if (ordersError) console.log("Error fetching customer orders:", ordersError.message);
    setOrders(orderData ?? []);
    const { data: returnData, error: returnsError } = await supabase
      .from("returns")
      .select("net_amount")
      .eq("customer_id", id);
    if (returnsError) console.log("Error fetching customer returns:", returnsError.message);
    setReturnedTotal((returnData ?? []).reduce((sum, r) => sum + Number(r.net_amount), 0));
    setLoadingData(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const totalOrders = activeOrders.length;
  const totalSpent = Math.max(0, activeOrders.reduce((sum, o) => sum + Number(o.total), 0) - returnedTotal);
  const totalDue = activeOrders.reduce((sum, o) => sum + orderDue(o), 0);
  const lastOrder = orders[0]?.created_at;

  async function handleRecordPayment() {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert("Invalid amount", "Enter a payment amount greater than 0.");
      return;
    }
    if (!business || !session) return;

    if (!isConnected) {
      const alreadyQueued = await getQueuedPaymentTotalForCustomer(business.id, session.user.id, id);
      if (exceedsAmount(amount + alreadyQueued, totalDue)) {
        showAlert(
          "Too much",
          `This customer only owes ${formatCurrency(totalDue)} in total${
            alreadyQueued > 0 ? ` (${formatCurrency(alreadyQueued)} already queued offline)` : ""
          }.`,
        );
        return;
      }
      setRecordingPayment(true);
      await addPendingCustomerPayment(business.id, session.user.id, {
        customerId: id,
        customerName: name,
        amount,
      });
      await refreshOfflineSync();
      setRecordingPayment(false);
      setPaymentAmount("");
      showAlert(
        "Saved Offline",
        "This payment is saved on this device and will sync automatically once you're back online.",
      );
      return;
    }

    if (exceedsAmount(amount, totalDue)) {
      showAlert("Too much", `This customer only owes ${formatCurrency(totalDue)} in total.`);
      return;
    }
    setRecordingPayment(true);
    const { error } = await supabase.rpc("record_customer_payment", {
      p_customer_id: id,
      p_amount: amount,
    });
    setRecordingPayment(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    setPaymentAmount("");
    load();
  }

  function handleRemindWhatsApp() {
    if (!phone.trim()) {
      showAlert("No phone number", "Add a phone number for this customer first.");
      return;
    }
    const ok = openWhatsApp(
      phone.trim(),
      `Hi ${name}, a friendly reminder that ${formatCurrency(totalDue)} is due on your account with ${business?.name ?? "us"}. Thank you!`,
    );
    if (!ok) showAlert("Invalid phone number", "This phone number doesn't look valid.");
  }

  async function handleShareStatement(format: InvoiceFormat) {
    if (!business) return;
    setSharingStatement(true);
    try {
      await generateCustomerStatement(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        name,
        phone || null,
        orders,
        format,
      );
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not generate statement.");
    }
    setSharingStatement(false);
  }

  async function handleSave() {
    if (!name.trim()) return showAlert("Missing info", "Customer name is required.");
    setLoading(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", id);
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    router.back();
  }

  function handleDelete() {
    showAlert(
      "Delete this customer?",
      "This cannot be undone. Their past orders stay intact but lose the customer link.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("customers").delete().eq("id", id);
            if (error) showAlert("Error", error.message);
            else router.back();
          },
        },
      ],
    );
  }

  if (loadingData) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalOrders}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, totalDue > 0 && { color: theme.colors.warning }]}>
            {formatCurrency(totalDue)}
          </Text>
          <Text style={styles.statLabel}>Outstanding</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {lastOrder ? new Date(lastOrder).toLocaleDateString() : "—"}
          </Text>
          <Text style={styles.statLabel}>Last Order</Text>
        </View>
      </View>

      <Button
        title="Generate A4 Statement"
        variant="outline"
        loading={sharingStatement}
        onPress={() => handleShareStatement("a4")}
        style={{ marginBottom: theme.spacing.sm }}
      />

      <Button
        title="Generate Thermal Statement"
        variant="outline"
        loading={sharingStatement}
        onPress={() => handleShareStatement("thermal")}
        style={{ marginBottom: theme.spacing.lg }}
      />

      <TextInput style={styles.input} placeholder="Name *" value={name} onChangeText={setName} editable={canEdit} />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={canEdit}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={canEdit}
      />
      <TextInput style={styles.input} placeholder="Address" value={address} onChangeText={setAddress} editable={canEdit} />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Notes"
        multiline
        value={notes}
        onChangeText={setNotes}
        editable={canEdit}
      />

      {canEdit && (
        <Button
          title={loading ? "Saving..." : "Save Changes"}
          onPress={handleSave}
          loading={loading}
          style={{ marginTop: theme.spacing.sm }}
        />
      )}
      {canDelete && (
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Customer</Text>
        </Pressable>
      )}

      {totalDue > 0 && (
        <View style={styles.paymentSection}>
          <Button
            title="Remind on WhatsApp"
            onPress={handleRemindWhatsApp}
            style={{ backgroundColor: "#25D366", marginBottom: theme.spacing.md }}
          />
          {can(permissions, "orders", "edit") && (
          <>
          <Text style={styles.historyTitle}>Record Payment</Text>
          <Text style={styles.paymentHint}>
            {isConnected
              ? "Applies to their oldest unpaid orders first."
              : "You're offline — this will be saved on this device and applied once it syncs."}
          </Text>
          <View style={styles.paymentRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: theme.spacing.sm, marginBottom: 0 }]}
              placeholder={`Up to ${formatCurrency(totalDue)}`}
              keyboardType="decimal-pad"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
            />
            <Button
              title={recordingPayment ? "Saving..." : isConnected ? "Add" : "Add (Offline)"}
              size="sm"
              loading={recordingPayment}
              onPress={handleRecordPayment}
            />
          </View>
          </>
          )}
        </View>
      )}

      <Text style={styles.historyTitle}>Order History</Text>
      {orders.length === 0 ? (
        <Text style={styles.empty}>No orders yet.</Text>
      ) : (
        orders.map((o) => {
          const due = orderDue(o);
          return (
            <Pressable
              key={o.id}
              style={styles.orderRow}
              onPress={() => router.push(`/(app)/orders/${o.id}`)}
            >
              <Text style={styles.orderText}>{o.order_number}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.orderAmount}>{formatCurrency(o.total)}</Text>
                {o.status === "cancelled" ? (
                  <Text style={styles.orderCancelled}>Cancelled</Text>
                ) : (
                  due > 0 && <Text style={styles.orderDue}>Due {formatCurrency(due)}</Text>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.lg },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statValue: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  deleteButton: { padding: theme.spacing.md, alignItems: "center", marginTop: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.error, fontWeight: "600" },
  historyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  empty: { color: theme.colors.muted },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  orderText: { color: theme.colors.text },
  orderAmount: { color: theme.colors.text, fontWeight: "600" },
  orderDue: { color: theme.colors.warning, fontSize: 11, marginTop: 2 },
  orderCancelled: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  paymentSection: { marginTop: theme.spacing.xl },
  paymentHint: { color: theme.colors.muted, fontSize: 12, marginBottom: theme.spacing.sm },
  paymentRow: { flexDirection: "row", alignItems: "center" },
});
