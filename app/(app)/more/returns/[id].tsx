import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { generateReturnReceipt, InvoiceFormat } from "../../../../src/lib/invoice";
import { showAlert } from "../../../../src/lib/alert";
import { Button } from "../../../../src/components/button";
import { formatQuantity, UnitType } from "../../../../src/lib/units";
import { formatCurrency } from "../../../../src/lib/currency";
import { theme } from "../../../../src/lib/theme";

type ReturnItem = {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products: { name: string; unit_type: UnitType; unit: string | null; pack_size: number | null } | null;
};
type ReturnDetail = {
  id: string;
  return_number: string;
  gross_amount: number;
  deduction_type: string;
  deduction_value: number;
  deduction_amount: number;
  net_amount: number;
  notes: string | null;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
  creator: { full_name: string } | null;
};

export default function ReturnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useBusiness();
  const [ret, setRet] = useState<ReturnDetail | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    const { data: retData, error: retError } = await supabase
      .from("returns")
      .select(
        "id, return_number, gross_amount, deduction_type, deduction_value, deduction_amount, net_amount, notes, created_at, customers(name, phone), creator:profiles!created_by(full_name)",
      )
      .eq("id", id)
      .maybeSingle();
    if (retError) console.log("Error fetching return:", retError.message);
    setRet(retData as any);

    const { data: itemsData, error: itemsError } = await supabase
      .from("return_items")
      .select("id, quantity, unit_price, subtotal, products(name, unit_type, unit, pack_size)")
      .eq("return_id", id);
    if (itemsError) console.log("Error fetching return items:", itemsError.message);
    setItems((itemsData as any) ?? []);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handlePrint(format: InvoiceFormat) {
    if (!ret || !business) return;
    setPrinting(true);
    try {
      await generateReturnReceipt(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        ret.customers ? { name: ret.customers.name, phone: ret.customers.phone } : null,
        {
          return_number: ret.return_number,
          created_at: ret.created_at,
          gross_amount: ret.gross_amount,
          deduction_type: ret.deduction_type,
          deduction_value: ret.deduction_value,
          deduction_amount: ret.deduction_amount,
          net_amount: ret.net_amount,
          cashier_name: ret.creator?.full_name ?? null,
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
      showAlert("Error", e?.message ?? "Could not generate the receipt.");
    }
    setPrinting(false);
  }

  if (loading || !ret) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.returnNumber}>{ret.return_number}</Text>
      <Text style={styles.customer}>{ret.customers?.name ?? "Walk-in"}</Text>
      <Text style={styles.date}>{new Date(ret.created_at).toLocaleString()}</Text>
      {ret.creator?.full_name && <Text style={styles.meta}>Processed by {ret.creator.full_name}</Text>}

      <Text style={styles.sectionTitle}>Items Returned</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
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
          <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
        </View>
      ))}

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross Amount</Text>
          <Text style={styles.summaryValue}>{formatCurrency(ret.gross_amount)}</Text>
        </View>
        {ret.deduction_amount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Deduction ({ret.deduction_type === "percentage" ? `${ret.deduction_value}%` : "flat"})
            </Text>
            <Text style={styles.summaryValue}>− {formatCurrency(ret.deduction_amount)}</Text>
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBold}>Net Refund</Text>
          <Text style={styles.summaryValueBold}>{formatCurrency(ret.net_amount)}</Text>
        </View>
      </View>

      {ret.notes ? <Text style={styles.notes}>Notes: {ret.notes}</Text> : null}

      <Button
        title="Print A4 Receipt"
        variant="outline"
        loading={printing}
        onPress={() => handlePrint("a4")}
        style={{ marginTop: theme.spacing.lg }}
      />
      <Button
        title="Print Thermal Receipt"
        variant="outline"
        loading={printing}
        onPress={() => handlePrint("thermal")}
        style={{ marginTop: theme.spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background },
  returnNumber: { fontSize: 22, fontWeight: "700", color: theme.colors.text },
  customer: { fontSize: 16, color: theme.colors.text, marginTop: 2 },
  date: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  meta: { color: theme.colors.muted, fontSize: 12, marginTop: 2, marginBottom: theme.spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemName: { color: theme.colors.text },
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
  summaryLabelBold: { color: theme.colors.text, fontWeight: "700" },
  summaryValueBold: { color: theme.colors.warning, fontWeight: "700" },
  notes: { color: theme.colors.muted, marginTop: theme.spacing.md },
});
