import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { useNetwork } from "../../../../src/hooks/useNetwork";
import { useOfflineSync } from "../../../../src/hooks/useOfflineSync";
import { addPendingReturn } from "../../../../src/lib/offlineQueue";
import { showAlert } from "../../../../src/lib/alert";
import { SegmentedControl } from "../../../../src/components/segmented-control";
import { Button } from "../../../../src/components/button";
import { can } from "../../../../src/lib/permissions";
import { generateReturnReceipt, InvoiceFormat } from "../../../../src/lib/invoice";
import { formatQuantity, splitPacks, UnitType } from "../../../../src/lib/units";
import { formatCurrency } from "../../../../src/lib/currency";
import { theme } from "../../../../src/lib/theme";

type Product = {
  id: string;
  name: string;
  selling_price: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};
type Customer = { id: string; name: string };
type CartItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};
type PreviewItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  matched_sale: boolean;
};
type Preview = {
  items: PreviewItem[];
  gross_amount: number;
  deduction_amount: number;
  net_amount: number;
  customer_due?: number;
  credit_applied?: number;
  cash_refund?: number;
};

const REFUND_METHODS = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank Transfer", value: "bank" },
  { label: "Other", value: "other" },
] as const;

export default function NewReturn() {
  const { business, permissions } = useBusiness();
  const { session } = useAuth();
  const { isConnected } = useNetwork();
  const { refresh: refreshOfflineSync } = useOfflineSync();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [qtyText, setQtyText] = useState<Record<string, string>>({});
  const [deductionType, setDeductionType] = useState<"flat" | "percentage">("flat");
  const [deductionValue, setDeductionValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!business) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
    supabase
      .from("products")
      .select("id, name, selling_price, unit_type, unit, pack_size, pack_price")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) console.log("Error fetching products:", error.message);
        setProducts(data ?? []);
      });
  }, [business?.id]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addToCart(p: Product) {
    const startQty = p.unit_type === "pack" ? (p.pack_size ?? 1) : 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === p.id ? { ...c, quantity: c.quantity + startQty } : c,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          quantity: startQty,
          unit_type: p.unit_type,
          unit: p.unit,
          pack_size: p.pack_size,
          pack_price: p.pack_price,
        },
      ];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    clearQuantityText(productId);
    setCart((prev) =>
      prev
        .map((c) => (c.product_id === productId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  function changePackCount(productId: string, deltaPacks: number) {
    clearQuantityText(productId);
    setCart((prev) =>
      prev
        .map((c) =>
          c.product_id === productId && c.pack_size
            ? { ...c, quantity: c.quantity + deltaPacks * c.pack_size }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  }

  function setQuantityText(productId: string, text: string) {
    setQtyText((prev) => ({ ...prev, [productId]: text }));
    const num = parseFloat(text);
    if (!isNaN(num) && num >= 0) {
      setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, quantity: num } : c)));
    }
  }

  function clearQuantityText(productId: string) {
    setQtyText((prev) => {
      const { [productId]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function removeFromCart(productId: string) {
    clearQuantityText(productId);
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  }

  const validCart = cart.filter((c) => c.quantity > 0);
  const deductionNum = parseFloat(deductionValue) || 0;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (validCart.length === 0 || !business || !isConnected) {
      setPreview(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setPreviewing(true);
      const { data, error } = await supabase.rpc("create_return", {
        p_business_id: business.id,
        p_customer_id: customerId || null,
        p_items: validCart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
        p_deduction_type: deductionType,
        p_deduction_value: deductionNum,
        p_notes: notes.trim() || null,
        p_dry_run: true,
        p_refund_method: refundMethod,
      });
      setPreviewing(false);
      if (!error) setPreview(data as Preview);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(validCart), customerId, deductionType, deductionNum]);

  function resetFormForNextReturn() {
    setCart([]);
    setQtyText({});
    setCustomerId("");
    setDeductionType("flat");
    setDeductionValue("0");
    setNotes("");
    setRefundMethod("cash");
    setPreview(null);
  }

  function currentPriceSubtotal(c: CartItem): number {
    const product = products.find((p) => p.id === c.product_id);
    const unitPrice = product?.selling_price ?? 0;
    if (c.unit_type === "pack" && c.pack_size) {
      const { packs, loose } = splitPacks(c.quantity, c.pack_size);
      return packs * (c.pack_price ?? 0) + loose * unitPrice;
    }
    return c.quantity * unitPrice;
  }

  // Can't ask the server to match original sale prices while offline, so
  // this is a rough stand-in using each product's current price —
  // good enough for the cashier to see roughly what's being refunded; the
  // real gross/net amount is computed for real once this syncs.
  function offlineEstimate() {
    const gross = validCart.reduce((sum, c) => sum + currentPriceSubtotal(c), 0);
    const deduction = deductionType === "percentage" ? (gross * deductionNum) / 100 : deductionNum;
    return { gross, net: Math.max(0, gross - deduction) };
  }

  async function printOfflineReceipt(label: string, format: InvoiceFormat) {
    if (!business) return;
    const estimate = offlineEstimate();
    const selectedCustomer = customers.find((c) => c.id === customerId);
    try {
      await generateReturnReceipt(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        selectedCustomer ? { name: selectedCustomer.name, phone: null } : null,
        {
          return_number: `${label} — PENDING SYNC`,
          created_at: new Date().toISOString(),
          gross_amount: estimate.gross,
          deduction_type: deductionType,
          deduction_value: deductionNum,
          deduction_amount: estimate.gross - estimate.net,
          net_amount: estimate.net,
          cashier_name: (session?.user.user_metadata?.full_name as string) ?? null,
        },
        validCart.map((c) => {
          const subtotal = currentPriceSubtotal(c);
          return {
            name: c.name,
            quantity: c.quantity,
            unit_price: c.quantity > 0 ? subtotal / c.quantity : 0,
            subtotal,
            unit_type: c.unit_type,
            unit: c.unit,
            pack_size: c.pack_size,
          };
        }),
        format,
      );
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not generate the receipt.");
    }
  }

  async function handleSave(printFormat?: InvoiceFormat) {
    if (!business || !session) return;
    if (validCart.length === 0)
      return showAlert("No products", "Add at least one product being returned.");

    if (!isConnected) {
      setSaving(true);
      const pending = await addPendingReturn(business.id, session.user.id, {
        customerId: customerId || null,
        items: validCart.map((c) => ({ product_id: c.product_id, product_name: c.name, quantity: c.quantity })),
        deductionType,
        deductionValue: deductionNum,
        notes: notes.trim(),
        netEstimate: offlineEstimate().net,
        refundMethod,
      });
      await refreshOfflineSync();

      if (printFormat) {
        await printOfflineReceipt(pending.local_label, printFormat);
      }
      setSaving(false);
      showAlert(
        "Saved Offline",
        `${pending.local_label} — kept safely on this device and will sync automatically once you're back online.`,
      );
      resetFormForNextReturn();
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("create_return", {
      p_business_id: business.id,
      p_customer_id: customerId || null,
      p_items: validCart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
      p_deduction_type: deductionType,
      p_deduction_value: deductionNum,
      p_notes: notes.trim() || null,
      p_dry_run: false,
      p_refund_method: refundMethod,
    });
    if (error) {
      setSaving(false);
      showAlert("Error", error.message);
      return;
    }
    const result = data as Preview & { return_id: string; return_number: string };
    const credit = Number(result.credit_applied ?? 0);
    const cash = Number(result.cash_refund ?? result.net_amount);
    const settlement =
      credit > 0
        ? cash > 0
          ? `${formatCurrency(credit)} adjusted against the customer's balance, ${formatCurrency(cash)} refunded.`
          : `${formatCurrency(credit)} adjusted against the customer's balance — no cash to hand back.`
        : `${formatCurrency(cash)} refunded.`;

    if (printFormat) {
      await printReceipt(result.return_id, printFormat);
      setSaving(false);
      router.back();
      return;
    }

    setSaving(false);
    showAlert(
      "Return Processed",
      `${result.return_number}: ${settlement} Stock has been updated.`,
      [{ text: "OK", onPress: () => router.back() }],
    );
  }

  async function printReceipt(returnId: string, format: InvoiceFormat) {
    if (!business) return;
    const { data: ret, error: retError } = await supabase
      .from("returns")
      .select(
        "return_number, created_at, gross_amount, deduction_type, deduction_value, deduction_amount, net_amount, credit_applied, cash_refunded, refund_method, customers(name, phone), creator:profiles!created_by(full_name)",
      )
      .eq("id", returnId)
      .maybeSingle();
    if (retError) console.log("Error fetching return for receipt:", retError.message);
    const { data: items, error: itemsError } = await supabase
      .from("return_items")
      .select("quantity, unit_price, subtotal, products(name, unit_type, unit, pack_size)")
      .eq("return_id", returnId);
    if (itemsError) console.log("Error fetching return items for receipt:", itemsError.message);

    if (!ret) {
      showAlert("Return saved", "The return was saved, but the receipt couldn't be generated. You can print it from the return's details screen.");
      return;
    }
    try {
      await generateReturnReceipt(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        (ret as any).customers ? { name: (ret as any).customers.name, phone: (ret as any).customers.phone } : null,
        {
          return_number: ret.return_number,
          created_at: ret.created_at,
          gross_amount: ret.gross_amount,
          deduction_type: ret.deduction_type,
          deduction_value: ret.deduction_value,
          deduction_amount: ret.deduction_amount,
          net_amount: ret.net_amount,
          credit_applied: Number(ret.credit_applied),
          cash_refunded: Number(ret.cash_refunded),
          refund_method: ret.refund_method,
          cashier_name: (ret as any).creator?.full_name ?? null,
        },
        (items ?? []).map((item: any) => ({
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
  }

  function previewFor(productId: string): PreviewItem | undefined {
    return preview?.items.find((i) => i.product_id === productId);
  }

  if (!can(permissions, "returns", "add")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to process returns.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Customer (optional)</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={customerId} onValueChange={setCustomerId}>
          <Picker.Item label="Walk-in (no customer)" value="" />
          {customers.map((c) => (
            <Picker.Item key={c.id} label={c.name} value={c.id} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Products Being Returned</Text>
      <TextInput
        style={styles.input}
        placeholder="Search products..."
        value={search}
        onChangeText={setSearch}
      />
      {search.length > 0 && (
        <View style={styles.searchResults}>
          {filteredProducts.slice(0, 5).map((p) => (
            <Pressable
              key={p.id}
              style={styles.searchRow}
              onPress={() => {
                addToCart(p);
                setSearch("");
              }}
            >
              <Text style={styles.searchRowText}>
                {p.name} — {formatCurrency(p.selling_price)}
                {p.unit_type !== "each" ? `/${p.unit}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {cart.length === 0 ? (
        <Text style={styles.empty}>No products added yet.</Text>
      ) : (
        cart.map((item) => {
          const pv = previewFor(item.product_id);
          const pack = item.unit_type === "pack" ? splitPacks(item.quantity, item.pack_size ?? 1) : null;
          return (
            <View key={item.product_id} style={styles.cartRow}>
              <View style={styles.cartRowTop}>
                <Text style={styles.cartName}>{item.name}</Text>
                <Pressable style={styles.removeButton} onPress={() => removeFromCart(item.product_id)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.cartSubtotal}>
                {pv
                  ? `${formatQuantity(item.quantity, item)} = ${formatCurrency(pv.subtotal)}${pv.matched_sale ? " · matched to original sale" : " · current price"}`
                  : "Calculating price..."}
              </Text>

              {item.unit_type === "each" && (
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, -1)}>
                    <Text style={styles.qtyButtonText}>−</Text>
                  </Pressable>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="number-pad"
                    value={qtyText[item.product_id] ?? String(item.quantity)}
                    onChangeText={(v) => setQuantityText(item.product_id, v)}
                    onBlur={() => clearQuantityText(item.product_id)}
                    selectTextOnFocus
                  />
                  <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, 1)}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              )}

              {item.unit_type === "weight" && (
                <View style={styles.qtyRow}>
                  <TextInput
                    style={[styles.qtyInput, { width: 64 }]}
                    keyboardType="decimal-pad"
                    value={qtyText[item.product_id] ?? String(item.quantity)}
                    onChangeText={(v) => setQuantityText(item.product_id, v)}
                    onBlur={() => clearQuantityText(item.product_id)}
                    selectTextOnFocus
                  />
                  <Text style={styles.unitSuffix}>{item.unit}</Text>
                </View>
              )}

              {item.unit_type === "pack" && pack && (
                <View>
                  <View style={styles.packStepperRow}>
                    <Pressable style={styles.qtyButton} onPress={() => changePackCount(item.product_id, -1)}>
                      <Text style={styles.qtyButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.packStepperValue}>
                      {pack.packs} pack{pack.packs === 1 ? "" : "s"}
                    </Text>
                    <Pressable style={styles.qtyButton} onPress={() => changePackCount(item.product_id, 1)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={styles.packStepperRow}>
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, -1)}>
                      <Text style={styles.qtyButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.packStepperValue}>
                      {pack.loose} {item.unit}
                      {pack.loose === 1 ? "" : "s"}
                    </Text>
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, 1)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.label}>Deduction (restocking fee, damage, etc.)</Text>
      <SegmentedControl
        options={[
          { label: "Flat (Rs.)", value: "flat" },
          { label: "Percentage (%)", value: "percentage" },
        ]}
        value={deductionType}
        onChange={setDeductionType}
      />
      <TextInput
        style={styles.input}
        placeholder={deductionType === "percentage" ? "Deduction % (0 = none)" : "Deduction amount (0 = none)"}
        keyboardType="decimal-pad"
        value={deductionValue}
        onChangeText={setDeductionValue}
      />

      <TextInput
        style={[styles.input, { height: 70 }]}
        placeholder="Notes (optional)"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Text style={styles.label}>Refund Paid By</Text>
      <SegmentedControl options={REFUND_METHODS} value={refundMethod} onChange={setRefundMethod} />
      {customerId ? (
        <Text style={styles.creditHint}>
          If this customer owes you money, the refund is first knocked off their balance; only the rest is paid
          back.
        </Text>
      ) : null}

      <View style={styles.summary}>
        {previewing && <ActivityIndicator color={theme.colors.primary} style={{ marginBottom: theme.spacing.sm }} />}
        {!isConnected && validCart.length > 0 && (
          <Text style={styles.offlineNote}>Offline estimate — final amount is confirmed once this syncs.</Text>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross Amount</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(isConnected ? (preview?.gross_amount ?? 0) : offlineEstimate().gross)}
          </Text>
        </View>
        {isConnected && (preview?.deduction_amount ?? 0) > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Deduction</Text>
            <Text style={styles.summaryValue}>− {formatCurrency(preview?.deduction_amount ?? 0)}</Text>
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBold}>Net Refund</Text>
          <Text style={styles.summaryValueBold}>
            {formatCurrency(isConnected ? (preview?.net_amount ?? 0) : offlineEstimate().net)}
          </Text>
        </View>
        {isConnected && (preview?.credit_applied ?? 0) > 0 && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Adjusted in balance (owes {formatCurrency(preview?.customer_due ?? 0)})
              </Text>
              <Text style={styles.summaryValue}>− {formatCurrency(preview?.credit_applied ?? 0)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelBold}>Pay Back Now</Text>
              <Text style={styles.summaryValueBold}>{formatCurrency(preview?.cash_refund ?? 0)}</Text>
            </View>
          </>
        )}
      </View>

      <Button
        title={saving ? "Processing..." : isConnected ? "Process Return" : "Process Return (Offline)"}
        onPress={() => handleSave()}
        disabled={validCart.length === 0}
        loading={saving}
        style={{ marginTop: theme.spacing.lg }}
      />
      <Button
        title="Process & Print A4 Receipt"
        variant="outline"
        onPress={() => handleSave("a4")}
        disabled={validCart.length === 0}
        loading={saving}
        style={{ marginTop: theme.spacing.sm }}
      />
      <Button
        title="Process & Print Thermal Receipt"
        variant="outline"
        onPress={() => handleSave("thermal")}
        disabled={validCart.length === 0}
        loading={saving}
        style={{ marginTop: theme.spacing.sm }}
      />
      <Text style={styles.hint}>
        {isConnected
          ? "Stock is restored immediately for every item returned."
          : "You're offline — this return will be saved on this device and synced automatically once you're back online."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  creditHint: { color: theme.colors.muted, fontSize: 12, marginTop: theme.spacing.xs },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
  },
  searchRow: { padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  searchRowText: { color: theme.colors.text },
  empty: { color: theme.colors.muted, marginBottom: theme.spacing.sm },
  cartRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cartRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cartName: { color: theme.colors.text, fontWeight: "600", flex: 1 },
  cartSubtotal: { color: theme.colors.muted, fontSize: 12, marginTop: 2, marginBottom: theme.spacing.xs },
  qtyRow: { flexDirection: "row", alignItems: "center" },
  packStepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  packStepperValue: { width: 90, textAlign: "center", color: theme.colors.text, fontWeight: "600", fontSize: 12 },
  unitSuffix: { marginLeft: theme.spacing.xs, color: theme.colors.muted, fontWeight: "600" },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyButtonText: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  qtyInput: {
    width: 48,
    marginHorizontal: theme.spacing.xs,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
  },
  removeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.xs,
  },
  removeButtonText: { color: theme.colors.error, fontSize: 18, fontWeight: "700" },
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
  offlineNote: { color: theme.colors.warning, fontSize: 11, marginBottom: theme.spacing.xs },
  hint: { color: theme.colors.muted, fontSize: 12, textAlign: "center", marginTop: theme.spacing.sm },
});
