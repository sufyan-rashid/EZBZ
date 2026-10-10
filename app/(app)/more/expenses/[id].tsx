import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { can } from "../../../../src/lib/permissions";
import { SegmentedControl } from "../../../../src/components/segmented-control";
import { Button } from "../../../../src/components/button";
import { theme } from "../../../../src/lib/theme";

const CATEGORIES = [
  "Rent",
  "Salary",
  "Utilities",
  "Marketing",
  "Transportation",
  "Packaging",
  "Inventory Purchase",
  "Software",
  "Other",
];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ label: c, value: c }));

export default function EditExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { permissions } = useBusiness();
  const canEdit = can(permissions, "expenses", "edit");
  const canDelete = can(permissions, "expenses", "delete");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.log("Error fetching expense:", error.message);
        if (data) {
          setTitle(data.title);
          setCategory(data.category);
          setAmount(String(data.amount));
          setDate(data.date);
          setNotes(data.notes ?? "");
        }
        setLoadingData(false);
      });
  }, [id]);

  async function handleSave() {
    const amountNum = parseFloat(amount);
    if (!title.trim()) return showAlert("Missing info", "Title is required.");
    if (isNaN(amountNum) || amountNum <= 0)
      return showAlert("Invalid amount", "Amount must be greater than 0.");

    setLoading(true);
    const { error } = await supabase
      .from("expenses")
      .update({
        title: title.trim(),
        category,
        amount: amountNum,
        date,
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
    showAlert("Delete this expense?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("expenses").delete().eq("id", id);
          if (error) showAlert("Error", error.message);
          else router.back();
        },
      },
    ]);
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
      <TextInput style={styles.input} placeholder="Title *" value={title} onChangeText={setTitle} editable={canEdit} />

      <Text style={styles.label}>Category</Text>
      <SegmentedControl options={CATEGORY_OPTIONS} value={category} onChange={canEdit ? setCategory : () => {}} />

      <TextInput
        style={styles.input}
        placeholder="Amount (Rs.) *"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        editable={canEdit}
      />
      <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={canEdit} />
      <TextInput
        style={[styles.input, { height: 70 }]}
        placeholder="Notes (optional)"
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
          <Text style={styles.deleteButtonText}>Delete Expense</Text>
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
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  deleteButton: { padding: theme.spacing.md, alignItems: "center", marginTop: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.error, fontWeight: "600" },
});
