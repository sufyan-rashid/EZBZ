import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet  } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { SegmentedControl } from "../../../../src/components/segmented-control";
import { Button } from "../../../../src/components/button";
import { formatQuantity, UnitType } from "../../../../src/lib/units";
import { theme } from "../../../../src/lib/theme";

type Transaction = {
  id: string;
  type: string;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  created_at: string;
};

const REASONS = ["Stock received", "Damaged", "Lost", "Correction", "Other"];
const REASON_OPTIONS = REASONS.map((r) => ({ label: r, value: r }));

export default function AdjustStock() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [productName, setProductName] = useState("");
  const [currentStock, setCurrentStock] = useState(0);
  const [unitType, setUnitType] = useState<UnitType>("each");
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [packSize, setPackSize] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [reason, setReason] = useState(REASONS[0]);
  const [totalCost, setTotalCost] = useState("");
  const [currentCostPrice, setCurrentCostPrice] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProduct = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("name, stock_quantity, unit_type, unit, pack_size, cost_price")
      .eq("id", productId)
      .maybeSingle();
    if (error) console.log("Error fetching product:", error.message);
    if (data) {
      setProductName(data.name);
      setCurrentStock(data.stock_quantity);
      setUnitType((data.unit_type as UnitType) ?? "each");
      setUnitLabel(data.unit ?? null);
      setPackSize(data.pack_size ?? null);
      setCurrentCostPrice(Number(data.cost_price));
    }
  }, [productId]);

  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("id, type, quantity, previous_quantity, new_quantity, reason, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) console.log("Error fetching inventory transactions:", error.message);
    setTransactions(data ?? []);
  }, [productId]);

  useFocusEffect(
    useCallback(() => {
      loadProduct();
      loadTransactions();
    }, [loadProduct, loadTransactions]),
  );

  async function handleAdjust() {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      showAlert("Invalid amount", "Enter a number greater than 0.");
      return;
    }
    let totalCostNum: number | null = null;
    if (direction === "add" && totalCost.trim()) {
      totalCostNum = parseFloat(totalCost);
      if (isNaN(totalCostNum) || totalCostNum < 0) {
        showAlert("Invalid cost", "Enter a valid total cost, or leave it blank to keep the current cost price.");
        return;
      }
    }
    const change = direction === "add" ? num : -num;
    setLoading(true);
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: productId,
      p_quantity_change: change,
      p_reason: reason,
      p_total_cost: totalCostNum,
    });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    setAmount("");
    setTotalCost("");
    loadProduct();
    loadTransactions();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{productName}</Text>
      <Text style={styles.currentStock}>
        Current stock: {formatQuantity(currentStock, { unit_type: unitType, unit: unitLabel, pack_size: packSize, pack_price: null })}
        {currentCostPrice != null ? ` · Avg. cost Rs. ${currentCostPrice.toFixed(2)} / ${unitLabel ?? "unit"}` : ""}
      </Text>

      <View style={styles.adjustRow}>
        <Pressable
          style={[styles.dirButton, direction === "add" && styles.dirButtonActive]}
          onPress={() => setDirection("add")}
        >
          <Text style={[styles.dirText, direction === "add" && styles.dirTextActive]}>+ Add</Text>
        </Pressable>
        <Pressable
          style={[styles.dirButton, direction === "remove" && styles.dirButtonActive]}
          onPress={() => setDirection("remove")}
        >
          <Text style={[styles.dirText, direction === "remove" && styles.dirTextActive]}>− Remove</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder={unitType === "each" ? "Amount" : `Amount (${unitLabel ?? "units"})`}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      {unitType === "pack" && packSize ? (
        <Text style={styles.hint}>
          Enter total individual {unitLabel ?? "unit"}s — e.g. one pack = {packSize}.
        </Text>
      ) : null}

      {direction === "add" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Total cost for this stock (Rs., optional)"
            keyboardType="decimal-pad"
            value={totalCost}
            onChangeText={setTotalCost}
          />
          <Text style={styles.hint}>
            What you paid in total for this batch — e.g. 5 packs at Rs. 150 each = 750. Leave blank
            to keep the current cost price. We&apos;ll blend it with what&apos;s already in stock to
            keep your profit numbers accurate.
          </Text>
        </>
      )}

      <SegmentedControl options={REASON_OPTIONS} value={reason} onChange={setReason} />

      <Button
        title={loading ? "Saving..." : "Save Adjustment"}
        onPress={handleAdjust}
        loading={loading}
        style={{ marginBottom: theme.spacing.lg }}
      />

      <Text style={styles.historyTitle}>Recent History</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No adjustments yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.historyRow}>
            <Text style={styles.historyText}>
              {item.quantity > 0 ? "+" : ""}
              {item.quantity} ({formatQuantity(item.previous_quantity, { unit_type: unitType, unit: unitLabel, pack_size: packSize, pack_price: null })}
              {" → "}
              {formatQuantity(item.new_quantity, { unit_type: unitType, unit: unitLabel, pack_size: packSize, pack_price: null })})
            </Text>
            <Text style={styles.historyReason}>{item.reason ?? item.type}</Text>
            <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  currentStock: { color: theme.colors.muted, marginBottom: theme.spacing.lg },
  adjustRow: { flexDirection: "row", marginBottom: theme.spacing.md },
  dirButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: "center",
    marginRight: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  dirButtonActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dirText: { color: theme.colors.text, fontWeight: "600" },
  dirTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  hint: { color: theme.colors.muted, fontSize: 12, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.md },
  historyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.sm },
  historyRow: { paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  historyText: { color: theme.colors.text, fontWeight: "600" },
  historyReason: { color: theme.colors.muted, fontSize: 12 },
  historyDate: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.lg },
});
