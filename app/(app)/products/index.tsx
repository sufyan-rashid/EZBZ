import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { SearchInput } from "../../../src/components/search-input";
import { Button } from "../../../src/components/button";
import { can } from "../../../src/lib/permissions";
import { formatQuantity, UnitType } from "../../../src/lib/units";
import { formatCurrency } from "../../../src/lib/currency";
import { theme } from "../../../src/lib/theme";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};

function stockStatus(p: Product) {
  if (p.stock_quantity <= 0) return { label: "Out of Stock", color: theme.colors.error };
  if (p.stock_quantity <= p.low_stock_threshold)
    return { label: "Low Stock", color: theme.colors.warning };
  return { label: "In Stock", color: theme.colors.success };
}

export default function ProductsList() {
  const { business, permissions } = useBusiness();
  const canView = can(permissions, "products", "view");
  const canAdd = can(permissions, "products", "add");
  const canEdit = can(permissions, "products", "edit");
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  const loadProducts = useCallback(async () => {
    if (!business) return;
    let query = supabase
      .from("products")
      .select("id, name, sku, selling_price, stock_quantity, low_stock_threshold, unit_type, unit, pack_size, pack_price")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name");
    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) console.log("Error fetching products:", error.message);
    setProducts(data ?? []);
  }, [business?.id, search]);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts]),
  );

  if (!canView) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view products.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SearchInput style={styles.search} placeholder="Search products..." value={search} onChangeText={setSearch} />
        {canAdd && (
          <Button title="+ Add" size="sm" onPress={() => router.push("/(app)/products/new")} />
        )}
      </View>
      {(canAdd || canEdit) && (
        <View style={styles.linksRow}>
          {canEdit && (
            <Pressable onPress={() => router.push("/(app)/products/categories")}>
              <Text style={styles.categoriesLink}>Manage Categories</Text>
            </Pressable>
          )}
          {canAdd && (
            <Pressable onPress={() => router.push("/(app)/products/import")}>
              <Text style={styles.categoriesLink}>Import CSV</Text>
            </Pressable>
          )}
        </View>
      )}

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No products yet.</Text>
            {canAdd && (
              <Button title="Add Product" onPress={() => router.push("/(app)/products/new")} />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const status = stockStatus(item);
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/(app)/products/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.sku ? <Text style={styles.sku}>SKU: {item.sku}</Text> : null}
                <Text style={styles.price}>
                  {formatCurrency(item.selling_price)}
                  {item.unit_type !== "each" ? ` / ${item.unit}` : ""}
                  {"  ·  "}
                  {formatQuantity(item.stock_quantity, item)} left
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: status.color }]}>
                <Text style={styles.badgeText}>{status.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.sm },
  search: {
    marginRight: theme.spacing.sm,
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  categoriesLink: {
    color: theme.colors.secondary,
    fontWeight: "600",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  name: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  sku: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  price: { color: theme.colors.text, marginTop: theme.spacing.xs },
  badge: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", marginTop: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, marginBottom: theme.spacing.md },
});
