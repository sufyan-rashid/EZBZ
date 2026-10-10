import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { can } from "../../../src/lib/permissions";
import { formatQuantity, UnitType } from "../../../src/lib/units";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

type Category = { id: string; name: string };

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  each: "Each (piece)",
  weight: "Weight / Volume",
  pack: "Pack + Loose Units",
};

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business, permissions } = useBusiness();
  const canEdit = can(permissions, "products", "edit");
  const canDelete = can(permissions, "products", "delete");
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unitType, setUnitType] = useState<UnitType>("each");
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [packSize, setPackSize] = useState<number | null>(null);
  const [packPrice, setPackPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockRaw, setStockRaw] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(true);

  useEffect(() => {
    if (!business) return;
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name")
      .then(({ data, error }) => {
        if (error) console.log("Error fetching categories:", error.message);
        setCategories(data ?? []);
      });

    supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.log("Error fetching product:", error.message);
        if (data) {
          setName(data.name);
          setSku(data.sku ?? "");
          setCategoryId(data.category_id ?? "");
          setUnitType((data.unit_type as UnitType) ?? "each");
          setUnitLabel(data.unit ?? null);
          setPackSize(data.pack_size ?? null);
          setPackPrice(data.pack_price != null ? String(data.pack_price) : "");
          setSellingPrice(String(data.selling_price));
          // cost_price is always stored per base/loose unit; show it as a
          // per-pack figure here since that's how the owner buys and thinks
          // about it for pack-type products (converted back on save).
          const packSizeForCost = data.pack_size ?? null;
          setCostPrice(
            data.unit_type === "pack" && packSizeForCost
              ? String(Math.round(Number(data.cost_price) * packSizeForCost * 100) / 100)
              : String(data.cost_price),
          );
          setStockRaw(Number(data.stock_quantity));
          setLowStockThreshold(String(data.low_stock_threshold));
          setDescription(data.description ?? "");
        }
        setLoadingProduct(false);
      });
  }, [business?.id, id]);

  async function handleSave() {
    const priceNum = parseFloat(sellingPrice);
    const costNum = parseFloat(costPrice);
    const packPriceNum = unitType === "pack" ? parseFloat(packPrice) : null;

    if (!name.trim()) return showAlert("Missing info", "Product name is required.");
    if (isNaN(priceNum) || priceNum < 0)
      return showAlert("Invalid price", "Selling price must be 0 or more.");
    if (isNaN(costNum) || costNum < 0)
      return showAlert("Invalid price", "Cost price must be 0 or more.");
    if (unitType === "pack" && (isNaN(packPriceNum!) || packPriceNum! < 0))
      return showAlert("Invalid price", "Pack price must be 0 or more.");

    // costNum was shown/edited as cost-per-pack for pack-type products;
    // convert back to cost-per-base-unit before storing (see load effect).
    const storedCostPrice = unitType === "pack" && packSize ? costNum / packSize : costNum;

    setLoading(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: name.trim(),
        sku: sku.trim() || null,
        category_id: categoryId || null,
        selling_price: priceNum,
        cost_price: storedCostPrice,
        pack_price: packPriceNum,
        low_stock_threshold: parseFloat(lowStockThreshold || "5"),
        description: description.trim() || null,
      })
      .eq("id", id);
    setLoading(false);
    if (error) {
      showAlert(
        "Error",
        error.message.includes("duplicate")
          ? "This SKU is already in use. Please choose another."
          : error.message,
      );
      return;
    }
    router.back();
  }

  function handleDeactivate() {
    showAlert(
      "Remove this product?",
      "It will no longer appear in your product list, but past orders that used it stay accurate.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("products")
              .update({ is_active: false })
              .eq("id", id);
            if (error) showAlert("Error", error.message);
            else router.back();
          },
        },
      ],
    );
  }

  if (loadingProduct) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Product Name *"
        value={name}
        onChangeText={setName}
        editable={canEdit}
      />
      <TextInput
        style={styles.input}
        placeholder="SKU (optional)"
        value={sku}
        onChangeText={setSku}
        editable={canEdit}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.pickerWrapper}>
        <Picker enabled={canEdit} selectedValue={categoryId} onValueChange={(value) => setCategoryId(value)}>
          <Picker.Item label="No category" value="" />
          {categories.map((c) => (
            <Picker.Item key={c.id} label={c.name} value={c.id} />
          ))}
        </Picker>
      </View>

      <View style={styles.stockRow}>
        <Text style={styles.stockLabel}>Sold By</Text>
        <Text style={styles.stockValue}>{UNIT_TYPE_LABELS[unitType]}</Text>
      </View>
      <Text style={styles.stockHint}>
        This can&apos;t be changed after the product is created (it would make past stock history ambiguous).
      </Text>

      {unitType === "pack" && (
        <TextInput
          style={styles.input}
          placeholder="Price for a full pack (Rs.) *"
          keyboardType="decimal-pad"
          value={packPrice}
          onChangeText={setPackPrice}
          editable={canEdit}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder={
          unitType === "weight"
            ? `Price per ${unitLabel ?? "unit"} (Rs.) *`
            : unitType === "pack"
              ? `Price per single ${unitLabel ?? "unit"} (Rs.) *`
              : "Selling Price (Rs.) *"
        }
        keyboardType="decimal-pad"
        value={sellingPrice}
        onChangeText={setSellingPrice}
        editable={canEdit}
      />
      <TextInput
        style={styles.input}
        placeholder={unitType === "pack" ? "Cost Price per Pack (Rs.) *" : "Cost Price (Rs.) *"}
        keyboardType="decimal-pad"
        value={costPrice}
        onChangeText={setCostPrice}
        editable={canEdit}
      />
      {unitType === "pack" && (
        <Text style={styles.stockHint}>
          What a full pack costs you — not the per-unit cost. Profit is worked out per base unit
          automatically, whether it&apos;s sold as a whole pack or broken into loose units.
        </Text>
      )}
      <View style={styles.stockRow}>
        <Text style={styles.stockLabel}>Current Stock</Text>
        <Text style={styles.stockValue}>
          {formatQuantity(stockRaw, { unit_type: unitType, unit: unitLabel, pack_size: packSize, pack_price: null })}
        </Text>
      </View>
      <Text style={styles.stockHint}>
        {can(permissions, "inventory", "edit")
          ? "Stock is changed from More → Inventory, not here — every change gets a reason and a history."
          : "Only someone with Inventory access can change stock levels."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Low Stock Alert Threshold"
        keyboardType="number-pad"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        editable={canEdit}
      />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Description (optional)"
        multiline
        value={description}
        onChangeText={setDescription}
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
        <Pressable style={styles.deleteButton} onPress={handleDeactivate}>
          <Text style={styles.deleteButtonText}>Remove Product</Text>
        </Pressable>
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
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  label: { color: theme.colors.muted, marginBottom: theme.spacing.xs },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  stockLabel: { color: theme.colors.muted },
  stockValue: { color: theme.colors.text, fontWeight: "700", fontSize: 16 },
  stockHint: { color: theme.colors.muted, fontSize: 12, marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  deleteButton: { padding: theme.spacing.md, alignItems: "center", marginTop: theme.spacing.md },
  deleteButtonText: { color: theme.colors.error, fontWeight: "600" },
});
