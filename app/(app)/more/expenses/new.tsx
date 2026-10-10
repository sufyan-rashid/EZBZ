import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { useNetwork } from "../../../../src/hooks/useNetwork";
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

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewExpense() {
  const { business, permissions } = useBusiness();
  const { isConnected } = useNetwork();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocalISO());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!isConnected) {
      return showAlert(
        "No internet connection",
        "This expense hasn't been saved. It's kept here safely — reconnect and tap Save Expense again.",
      );
    }
    const amountNum = parseFloat(amount);
    if (!title.trim()) return showAlert("Missing info", "Title is required.");
    if (isNaN(amountNum) || amountNum <= 0)
      return showAlert("Invalid amount", "Amount must be greater than 0.");
    if (!business) return;

    setLoading(true);
    const { error } = await supabase.from("expenses").insert({
      business_id: business.id,
      title: title.trim(),
      category,
      amount: amountNum,
      date,
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    router.back();
  }

  if (!can(permissions, "expenses", "add")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to add expenses.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput style={styles.input} placeholder="Title *" value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Category</Text>
      <SegmentedControl options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />

      <TextInput
        style={styles.input}
        placeholder="Amount (Rs.) *"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <TextInput
        style={[styles.input, { height: 70 }]}
        placeholder="Notes (optional)"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Button
        title={!isConnected ? "No Internet — Can't Save" : loading ? "Saving..." : "Save Expense"}
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
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
