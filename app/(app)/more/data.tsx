import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { can } from "../../../src/lib/permissions";
import { theme } from "../../../src/lib/theme";

function escapeCSV(value: any) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  if (rows.length === 0) {
    showAlert("Nothing to export", "There is no data in this section yet.");
    return;
  }
  const csvContent = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");

  try {
    if (Platform.OS === "web") {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const fileUri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: `Export ${filename}` });
    } else {
      showAlert("Saved", `File saved to ${fileUri}`);
    }
  } catch (e: any) {
    showAlert("Error", e?.message ?? "Could not export the file.");
  }
}

export default function Data() {
  const { business, permissions } = useBusiness();

  async function exportProducts() {
    if (!business) return;
    const { data, error } = await supabase
      .from("products")
      .select("name, sku, selling_price, cost_price, stock_quantity, is_active")
      .eq("business_id", business.id);
    if (error) return showAlert("Error", error.message);
    await exportCSV(
      "products.csv",
      ["Name", "SKU", "Selling Price", "Cost Price", "Stock", "Active"],
      (data ?? []).map((p) => [p.name, p.sku ?? "", p.selling_price, p.cost_price, p.stock_quantity, p.is_active ? "Yes" : "No"]),
    );
  }

  async function exportCustomers() {
    if (!business) return;
    const { data, error } = await supabase
      .from("customers")
      .select("name, phone, email, address")
      .eq("business_id", business.id);
    if (error) return showAlert("Error", error.message);
    await exportCSV(
      "customers.csv",
      ["Name", "Phone", "Email", "Address"],
      (data ?? []).map((c) => [c.name, c.phone ?? "", c.email ?? "", c.address ?? ""]),
    );
  }

  async function exportOrders() {
    if (!business) return;
    const { data, error } = await supabase
      .from("orders")
      .select("order_number, status, subtotal, discount, total, created_at, customers(name)")
      .eq("business_id", business.id);
    if (error) return showAlert("Error", error.message);
    await exportCSV(
      "orders.csv",
      ["Order Number", "Customer", "Status", "Subtotal", "Discount", "Total", "Date"],
      (data ?? []).map((o: any) => [
        o.order_number,
        o.customers?.name ?? "Walk-in",
        o.status,
        o.subtotal,
        o.discount,
        o.total,
        o.created_at,
      ]),
    );
  }

  async function exportExpenses() {
    if (!business) return;
    const { data, error } = await supabase
      .from("expenses")
      .select("title, category, amount, date")
      .eq("business_id", business.id);
    if (error) return showAlert("Error", error.message);
    await exportCSV(
      "expenses.csv",
      ["Title", "Category", "Amount", "Date"],
      (data ?? []).map((e) => [e.title, e.category, e.amount, e.date]),
    );
  }

  if (!can(permissions, "data", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to export data.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Export Data</Text>
      <View style={styles.card}>
        <Pressable style={styles.exportButton} onPress={exportProducts}>
          <Text style={styles.exportButtonText}>Export Products</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={exportCustomers}>
          <Text style={styles.exportButtonText}>Export Customers</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={exportOrders}>
          <Text style={styles.exportButtonText}>Export Orders</Text>
        </Pressable>
        <Pressable style={[styles.exportButton, { marginBottom: 0 }]} onPress={exportExpenses}>
          <Text style={styles.exportButtonText}>Export Expenses</Text>
        </Pressable>
      </View>
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
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  exportButton: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.md, padding: theme.spacing.md, alignItems: "center", marginBottom: theme.spacing.sm },
  exportButtonText: { color: theme.colors.primary, fontWeight: "600" },
});
