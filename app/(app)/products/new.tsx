import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { can } from "../../../src/lib/permissions";
import { SegmentedControl } from "../../../src/components/segmented-control";
import { Button } from "../../../src/components/button";
import { UnitType, WEIGHT_UNIT_OPTIONS } from "../../../src/lib/units";
import { theme } from "../../../src/lib/theme";

type Category = { id: string; name: string };

const UNIT_TYPE_OPTIONS: { label: string; value: UnitType }[] = [
  { label: "Each (piece)", value: "each" },
  { label: "Weight / Volume", value: "weight" },
  { label: "Pack + Loose Units", value: "pack" },
];

export default function NewProduct() {
  const { business, permissions } = useBusiness();
  const { isConnected } = useNetwork();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unitType, setUnitType] = useState<UnitType>("each");
  const [weightUnit, setWeightUnit] = useState<(typeof WEIGHT_UNIT_OPTIONS)[number]>("kg");
  const [packUnitLabel, setPackUnitLabel] = useState("");
  const [packSize, setPackSize] = useState("");
  const [packPrice, setPackPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

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
  }, [business?.id]);

  async function handleSave() {
    if (!isConnected) {
      return showAlert(
        "No internet connection",
        "This product hasn't been saved. It's kept here safely — reconnect and tap Save Product again.",
      );
    }
    const priceNum = parseFloat(sellingPrice);
    const costNum = parseFloat(costPrice);
    const stockNum = parseFloat(stock || "0");
    const packSizeNum = unitType === "pack" ? parseFloat(packSize) : null;
    const packPriceNum = unitType === "pack" ? parseFloat(packPrice) : null;

    if (!name.trim()) return showAlert("Missing info", "Product name is required.");
    if (isNaN(priceNum) || priceNum < 0)
      return showAlert(
        "Invalid price",
        unitType === "pack" ? "Enter a valid price for a single unit." : "Selling price must be 0 or more.",
      );
    if (isNaN(costNum) || costNum < 0)
      return showAlert("Invalid price", "Cost price must be 0 or more.");
    if (isNaN(stockNum) || stockNum < 0)
      return showAlert("Invalid stock", "Stock must be 0 or more.");
    if (unitType === "weight" && !weightUnit) {
      return showAlert("Missing info", "Choose a unit (kg, liter, etc).");
    }
    if (unitType === "pack") {
      if (!packUnitLabel.trim()) return showAlert("Missing info", "Name the individual unit (e.g. tablet).");
      if (isNaN(packSizeNum!) || packSizeNum! <= 0)
        return showAlert("Missing info", "Enter how many units are in one pack.");
      if (isNaN(packPriceNum!) || packPriceNum! < 0)
        return showAlert("Missing info", "Enter a valid price for a full pack.");
    }
    if (!business) return;

    // For pack-type products the shop owner thinks (and buys inventory) in
    // whole packs, so they enter cost per pack here — but order_items.unit_cost
    // (and every COGS/profit calculation built on it) is always expressed per
    // base/loose unit. Dividing by pack size once here keeps that storage
    // format consistent without touching any of the reporting SQL.
    const storedCostPrice = unitType === "pack" && packSizeNum ? costNum / packSizeNum : costNum;

    setLoading(true);
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      name: name.trim(),
      sku: sku.trim() || null,
      category_id: categoryId || null,
      unit_type: unitType,
      unit: unitType === "weight" ? weightUnit : unitType === "pack" ? packUnitLabel.trim() : null,
      pack_size: packSizeNum,
      pack_price: packPriceNum,
      selling_price: priceNum,
      cost_price: storedCostPrice,
      stock_quantity: stockNum,
      low_stock_threshold: parseFloat(lowStockThreshold || "5"),
      description: description.trim() || null,
    });
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

  if (!can(permissions, "products", "add")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to add products.
        </Text>
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
      />
      <TextInput
        style={styles.input}
        placeholder="SKU (optional)"
        value={sku}
        onChangeText={setSku}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={categoryId} onValueChange={(value) => setCategoryId(value)}>
          <Picker.Item label="No category" value="" />
          {categories.map((c) => (
            <Picker.Item key={c.id} label={c.name} value={c.id} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Sold By</Text>
      <SegmentedControl options={UNIT_TYPE_OPTIONS} value={unitType} onChange={setUnitType} />

      {unitType === "weight" && (
        <>
          <Text style={styles.label}>Unit</Text>
          <SegmentedControl
            options={WEIGHT_UNIT_OPTIONS.map((u) => ({ label: u, value: u }))}
            value={weightUnit}
            onChange={setWeightUnit}
          />
          <TextInput
            style={styles.input}
            placeholder={`Price per ${weightUnit} (Rs.) *`}
            keyboardType="decimal-pad"
            value={sellingPrice}
            onChangeText={setSellingPrice}
          />
        </>
      )}

      {unitType === "pack" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Unit name (e.g. tablet, egg) *"
            value={packUnitLabel}
            onChangeText={setPackUnitLabel}
          />
          <TextInput
            style={styles.input}
            placeholder="Units per pack (e.g. 12) *"
            keyboardType="decimal-pad"
            value={packSize}
            onChangeText={setPackSize}
          />
          <TextInput
            style={styles.input}
            placeholder="Price for a full pack (Rs.) *"
            keyboardType="decimal-pad"
            value={packPrice}
            onChangeText={setPackPrice}
          />
          <TextInput
            style={styles.input}
            placeholder={`Price per single ${packUnitLabel.trim() || "unit"} (Rs.) *`}
            keyboardType="decimal-pad"
            value={sellingPrice}
            onChangeText={setSellingPrice}
          />
        </>
      )}

      {unitType === "each" && (
        <TextInput
          style={styles.input}
          placeholder="Selling Price (Rs.) *"
          keyboardType="decimal-pad"
          value={sellingPrice}
          onChangeText={setSellingPrice}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder={unitType === "pack" ? "Cost Price per Pack (Rs.) *" : "Cost Price (Rs.) *"}
        keyboardType="decimal-pad"
        value={costPrice}
        onChangeText={setCostPrice}
      />
      {unitType === "pack" && (
        <Text style={styles.hint}>
          What a full pack costs you — not the per-unit cost. Profit is worked out per base unit
          automatically, whether it&apos;s sold as a whole pack or broken into loose units.
        </Text>
      )}
      <TextInput
        style={styles.input}
        placeholder={
          unitType === "weight"
            ? `Starting Stock (${weightUnit})`
            : unitType === "pack"
              ? `Starting Stock (total ${packUnitLabel.trim() || "units"})`
              : "Starting Stock"
        }
        keyboardType="decimal-pad"
        value={stock}
        onChangeText={setStock}
      />
      <TextInput
        style={styles.input}
        placeholder="Low Stock Alert Threshold"
        keyboardType="decimal-pad"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
      />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Description (optional)"
        multiline
        value={description}
        onChangeText={setDescription}
      />

      <Button
        title={!isConnected ? "No Internet — Can't Save" : loading ? "Saving..." : "Save Product"}
        onPress={handleSave}
        disabled={!isConnected}
        loading={loading}
        style={{ marginTop: theme.spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
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
  hint: { color: theme.colors.muted, fontSize: 11, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.md },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
