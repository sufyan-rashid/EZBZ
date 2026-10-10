import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { can } from "../../../src/lib/permissions";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

type Category = { id: string; name: string };

export default function Categories() {
  const { business, permissions } = useBusiness();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const canAdd = can(permissions, "products", "add");
  const canDelete = can(permissions, "products", "delete");

  async function loadCategories() {
    if (!business) return;
    const { data, error } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name");
    if (error) console.log("Error fetching categories:", error.message);
    setCategories(data ?? []);
  }

  useEffect(() => {
    loadCategories();
  }, [business?.id]);

  async function handleAdd() {
    if (!name.trim() || !business) return;
    setLoading(true);
    const { error } = await supabase
      .from("product_categories")
      .insert({ business_id: business.id, name: name.trim() });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    setName("");
    loadCategories();
  }

  function handleDelete(id: string) {
    showAlert(
      "Delete category?",
      "Products in this category keep their other details but lose this category.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("product_categories")
              .delete()
              .eq("id", id);
            if (error) showAlert("Error", error.message);
            else loadCategories();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {canAdd && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="New category name"
            value={name}
            onChangeText={setName}
          />
          <Button title="Add" size="sm" loading={loading} onPress={handleAdd} />
        </View>
      )}
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No categories yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item.name}</Text>
            {canDelete && (
              <Pressable onPress={() => handleDelete(item.id)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  addRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.lg },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowText: { color: theme.colors.text, fontSize: 16 },
  deleteText: { color: theme.colors.error, fontWeight: "600" },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
});
