import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { formatQuantity, UnitType } from "../../../../src/lib/units";
import { theme } from "../../../../src/lib/theme";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};

function stockColor(p: Product) {
  if (p.stock_quantity <= 0) return theme.colors.error;
  if (p.stock_quantity <= p.low_stock_threshold) return theme.colors.warning;
  return theme.colors.success;
}

export default function InventoryList() {
  const { business } = useBusiness();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);

  const load = useCallback(async () => {
    if (!business) return;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, stock_quantity, low_stock_threshold, unit_type, unit, pack_size, pack_price")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name");
    if (error) console.log("Error fetching inventory products:", error.message);
    setProducts(data ?? []);
  }, [business?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No products yet. Add products first.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(app)/more/inventory/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.sku ? <Text style={styles.sku}>SKU: {item.sku}</Text> : null}
            </View>
            <Text style={[styles.stock, { color: stockColor(item) }]}>{formatQuantity(item.stock_quantity, item)} in stock</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  name: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  sku: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  stock: { fontWeight: "600" },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
});
