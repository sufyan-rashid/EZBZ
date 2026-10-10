import { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { generateAndShareInvoice, InvoiceFormat } from "../../../src/lib/invoice";
import { can } from "../../../src/lib/permissions";
import { formatQuantity, UnitType } from "../../../src/lib/units";
import { formatCurrency } from "../../../src/lib/currency";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

type OrderItem = {
  id: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  subtotal: number;
  products: { name: string; unit_type: UnitType; unit: string | null; pack_size: number | null } | null;
};
type OrderDetailData = {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
  creator: { full_name: string } | null;
  canceller: { full_name: string } | null;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank Transfer",
  other: "Other",
};

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business, permissions } = useBusiness();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, subtotal, discount, total, amount_paid, payment_method, notes, created_at, customers(name, phone), creator:profiles!created_by(full_name), canceller:profiles!cancelled_by(full_name)",
      )
      .eq("id", id)
      .maybeSingle();
    if (orderError) console.log("Error fetching order:", orderError.message);
    setOrder(orderData as any);

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("id, quantity, returned_quantity, unit_price, subtotal, products(name, unit_type, unit, pack_size)")
      .eq("order_id", id);
    if (itemsError) console.log("Error fetching order items:", itemsError.message);
    setItems((itemsData as any) ?? []);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const due = order ? Math.max(0, order.total - order.amount_paid) : 0;

  async function handleRecordPayment() {
    if (!order) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert("Invalid amount", "Enter a payment amount greater than 0.");
      return;
    }
    if (amount > due) {
      showAlert("Too much", `This order only has ${formatCurrency(due)} outstanding.`);
      return;
    }
    setRecordingPayment(true);
    const { error } = await supabase.rpc("app_record_order_payment", {
      p_order_id: order.id,
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

  function handleCancelOrder() {
    if (!order) return;
    showAlert(
      "Cancel this order?",
      "Stock will be restored for every item. This cannot be undone.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancel Order",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            const { error } = await supabase.rpc("app_cancel_order", {
              p_order_id: order.id,
              p_reason: "Cancelled by staff",
            });
            setCancelling(false);
            if (error) {
              showAlert("Error", error.message);
              return;
            }
            load();
          },
        },
      ],
    );
  }

  async function handlePrint(format: InvoiceFormat) {
    if (!order || !business) return;
    setPrinting(true);
    try {
      await generateAndShareInvoice(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        order.customers ? { name: order.customers.name, phone: order.customers.phone } : null,
        {
          order_number: order.order_number,
          created_at: order.created_at,
          subtotal: order.subtotal,
          discount: order.discount,
          total: order.total,
          amount_paid: order.amount_paid,
          cashier_name: order.creator?.full_name ?? null,
        },
        items.map((item) => ({
          name: item.products?.name ?? "Product",
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          unit_type: item.products?.unit_type,
          unit: item.products?.unit,
          pack_size: item.products?.pack_size,
        })),
        format,
      );
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not generate invoice.");
    }
    setPrinting(false);
  }

  if (loading || !order) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.orderNumber}>{order.order_number}</Text>
      <Text
        style={[
          styles.status,
          order.status === "cancelled" && { color: theme.colors.error },
        ]}
      >
        Status: {order.status}
      </Text>
      <Text style={styles.customer}>Customer: {order.customers?.name ?? "Walk-in"}</Text>
      <Text style={styles.date}>{new Date(order.created_at).toLocaleString()}</Text>
      {order.creator?.full_name && (
        <Text style={styles.meta}>Created by {order.creator.full_name}</Text>
      )}
      {order.status === "cancelled" && order.canceller?.full_name && (
        <Text style={[styles.meta, { color: theme.colors.error }]}>
          Cancelled by {order.canceller.full_name}
        </Text>
      )}

      <Text style={styles.sectionTitle}>Items</Text>
      {items.map((item) => {
        const netQuantity = item.quantity - item.returned_quantity;
        const netSubtotal = netQuantity * item.unit_price;
        return (
          <View key={item.id} style={styles.itemRow}>
            <View>
              <Text style={styles.itemName}>
                {item.products?.name ?? "Product"} ×{" "}
                {item.products && item.products.unit_type !== "each"
                  ? formatQuantity(item.quantity, {
                      unit_type: item.products.unit_type,
                      unit: item.products.unit,
                      pack_size: item.products.pack_size,
                      pack_price: null,
                    })
                  : item.quantity}
              </Text>
              {item.returned_quantity > 0 && (
                <Text style={styles.itemReturned}>{item.returned_quantity} returned</Text>
              )}
            </View>
            <Text style={styles.itemSubtotal}>{formatCurrency(netSubtotal)}</Text>
          </View>
        );
      })}

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatCurrency(order.subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={styles.summaryValue}>{formatCurrency(order.discount)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBold}>Total</Text>
          <Text style={styles.summaryValueBold}>{formatCurrency(order.total)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Payment Method</Text>
          <Text style={styles.summaryValue}>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValue}>{formatCurrency(order.amount_paid)}</Text>
        </View>
        {due > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.warning }]}>Due</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.warning, fontWeight: "700" }]}>
              {formatCurrency(due)}
            </Text>
          </View>
        )}
      </View>

      {order.notes ? <Text style={styles.notes}>Notes: {order.notes}</Text> : null}

      <Button
        title="Print A4 Invoice"
        variant="outline"
        loading={printing}
        onPress={() => handlePrint("a4")}
        style={{ marginTop: theme.spacing.lg }}
      />

      <Button
        title="Print Thermal Invoice"
        variant="outline"
        loading={printing}
        onPress={() => handlePrint("thermal")}
        style={{ marginTop: theme.spacing.sm }}
      />

      {order.status === "completed" && can(permissions, "orders", "delete") && (
        <Button
          title="Cancel Order"
          variant="outline"
          style={{ borderColor: theme.colors.error, marginTop: theme.spacing.md }}
          textStyle={{ color: theme.colors.error }}
          loading={cancelling}
          onPress={handleCancelOrder}
        />
      )}

      {due > 0 && order.status !== "cancelled" && can(permissions, "orders", "edit") && (
        <View style={styles.paymentSection}>
          <Text style={styles.sectionTitle}>Record Payment</Text>
          <View style={styles.paymentRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: theme.spacing.sm }]}
              placeholder={`Up to ${formatCurrency(due)}`}
              keyboardType="decimal-pad"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
            />
            <Button
              title={recordingPayment ? "Saving..." : "Add"}
              size="sm"
              loading={recordingPayment}
              onPress={handleRecordPayment}
            />
          </View>
        </View>
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
  orderNumber: { fontSize: 22, fontWeight: "700", color: theme.colors.text },
  status: { color: theme.colors.secondary, fontWeight: "600", marginTop: theme.spacing.xs, textTransform: "capitalize" },
  customer: { color: theme.colors.text, marginTop: theme.spacing.sm },
  date: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  meta: { color: theme.colors.muted, fontSize: 12, marginTop: 2, marginBottom: theme.spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.sm },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemName: { color: theme.colors.text },
  itemReturned: { color: theme.colors.warning, fontSize: 11, marginTop: 2 },
  itemSubtotal: { color: theme.colors.text, fontWeight: "600" },
  summary: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.xs },
  summaryLabel: { color: theme.colors.muted },
  summaryValue: { color: theme.colors.text },
  summaryLabelBold: { color: theme.colors.text, fontWeight: "700", fontSize: 16 },
  summaryValueBold: { color: theme.colors.text, fontWeight: "700", fontSize: 18 },
  notes: { color: theme.colors.muted, marginTop: theme.spacing.md },
  paymentSection: { marginTop: theme.spacing.xl },
  paymentRow: { flexDirection: "row", alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
