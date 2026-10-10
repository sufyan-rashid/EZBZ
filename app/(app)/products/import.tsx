import { useState } from "react";
import { View, Text, FlatList, StyleSheet, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import Papa from "papaparse";
import { useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { can } from "../../../src/lib/permissions";
import { formatCurrency } from "../../../src/lib/currency";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

const DEMO_CSV =
  "Name,SKU,Category,Selling Price,Cost Price,Stock,Low Stock Threshold\n" +
  "Sample Shirt,SHIRT-001,Clothing,1200,800,20,5\n" +
  "Sample Shoes,SHOE-001,Footwear,3500,2500,10,3\n" +
  "Sample Mug,MUG-001,Home,450,250,50,10\n";

type ParsedRow = {
  name: string;
  sku: string | null;
  category: string | null;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  error?: string;
};

function parseRow(raw: Record<string, string>): ParsedRow {
  const name = (raw["Name"] ?? raw["name"] ?? "").trim();
  const sellingPrice = parseFloat(raw["Selling Price"] ?? raw["selling_price"] ?? "");
  const costPrice = parseFloat(raw["Cost Price"] ?? raw["cost_price"] ?? "");
  const stock = parseInt(raw["Stock"] ?? raw["stock_quantity"] ?? "0", 10);
  const threshold = parseInt(raw["Low Stock Threshold"] ?? raw["low_stock_threshold"] ?? "5", 10);

  let error: string | undefined;
  if (!name) error = "Missing product name";
  else if (isNaN(sellingPrice) || sellingPrice < 0) error = "Invalid selling price";
  else if (isNaN(costPrice) || costPrice < 0) error = "Invalid cost price";

  return {
    name,
    sku: (raw["SKU"] ?? raw["sku"] ?? "").trim() || null,
    category: (raw["Category"] ?? raw["category"] ?? "").trim() || null,
    selling_price: isNaN(sellingPrice) ? 0 : sellingPrice,
    cost_price: isNaN(costPrice) ? 0 : costPrice,
    stock_quantity: isNaN(stock) ? 0 : stock,
    low_stock_threshold: isNaN(threshold) ? 5 : threshold,
    error,
  };
}

export default function ImportProducts() {
  const { business, permissions } = useBusiness();
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleDownloadDemo() {
    if (Platform.OS === "web") {
      const blob = new Blob([DEMO_CSV], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ezbz-products-template.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const file = new File(Paths.cache, "ezbz-products-template.csv");
      file.create({ overwrite: true });
      file.write(DEMO_CSV);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          UTI: "public.comma-separated-values-text",
          mimeType: "text/csv",
        });
      }
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not create the demo file.");
    }
  }

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    try {
      const text = await fetch(asset.uri).then((r) => r.text());
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      setRows(parsed.data.map(parseRow));
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not read the file.");
    }
  }

  const validRows = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  async function handleImport() {
    if (!business || validRows.length === 0) return;
    setImporting(true);

    const { data: existingCategories, error: existingCategoriesError } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("business_id", business.id);
    if (existingCategoriesError) {
      setImporting(false);
      showAlert("Error", existingCategoriesError.message);
      return;
    }
    const categoryMap = new Map((existingCategories ?? []).map((c) => [c.name.toLowerCase(), c.id]));

    const neededNames = Array.from(
      new Set(validRows.map((r) => r.category).filter((c): c is string => !!c)),
    ).filter((c) => !categoryMap.has(c.toLowerCase()));

    if (neededNames.length > 0) {
      const { data: newCategories, error: catError } = await supabase
        .from("product_categories")
        .insert(neededNames.map((name) => ({ business_id: business.id, name })))
        .select("id, name");
      if (catError) {
        setImporting(false);
        showAlert("Error", catError.message);
        return;
      }
      (newCategories ?? []).forEach((c) => categoryMap.set(c.name.toLowerCase(), c.id));
    }

    const payload = validRows.map((r) => ({
      business_id: business.id,
      name: r.name,
      sku: r.sku,
      category_id: r.category ? (categoryMap.get(r.category.toLowerCase()) ?? null) : null,
      selling_price: r.selling_price,
      cost_price: r.cost_price,
      stock_quantity: r.stock_quantity,
      low_stock_threshold: r.low_stock_threshold,
    }));

    const { error } = await supabase.from("products").insert(payload);
    setImporting(false);
    if (error) {
      showAlert(
        "Error",
        error.message.includes("duplicate")
          ? "One or more SKUs already exist. Remove duplicates and try again."
          : error.message,
      );
      return;
    }
    showAlert("Imported", `${validRows.length} product${validRows.length === 1 ? "" : "s"} added.`);
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
    <View style={styles.container}>
      <Text style={styles.hint}>
        CSV columns: Name, SKU, Category, Selling Price, Cost Price, Stock, Low Stock Threshold.
        Name, Selling Price and Cost Price are required — everything else is optional.
      </Text>

      <Button
        title="Download Demo CSV"
        variant="outline"
        style={{ borderColor: theme.colors.secondary, marginBottom: theme.spacing.sm }}
        textStyle={{ color: theme.colors.secondary }}
        onPress={handleDownloadDemo}
      />

      <Button
        title={fileName || "Choose CSV File"}
        variant="outline"
        onPress={handlePickFile}
        style={{ marginBottom: theme.spacing.md }}
      />

      {rows.length > 0 && (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>{validRows.length} ready to import</Text>
            {invalidRows.length > 0 && (
              <Text style={styles.summaryError}>{invalidRows.length} with errors</Text>
            )}
          </View>

          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name || "(no name)"}</Text>
                  {item.category ? <Text style={styles.rowDetail}>{item.category}</Text> : null}
                </View>
                {item.error ? (
                  <Text style={styles.rowErrorText}>{item.error}</Text>
                ) : (
                  <Text style={styles.rowPrice}>{formatCurrency(item.selling_price)}</Text>
                )}
              </View>
            )}
          />

          <Button
            title={importing ? "Importing..." : `Import ${validRows.length} Product${validRows.length === 1 ? "" : "s"}`}
            onPress={handleImport}
            disabled={validRows.length === 0}
            loading={importing}
            style={{ marginTop: theme.spacing.sm }}
          />
        </>
      )}
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
  hint: { color: theme.colors.muted, fontSize: 12, marginBottom: theme.spacing.md },
  summaryRow: { flexDirection: "row", marginBottom: theme.spacing.sm },
  summaryText: { color: theme.colors.success, fontWeight: "600", marginRight: theme.spacing.md },
  summaryError: { color: theme.colors.error, fontWeight: "600" },
  list: { flex: 1 },
  row: {
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
  rowName: { color: theme.colors.text, fontWeight: "600" },
  rowDetail: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  rowPrice: { color: theme.colors.text, fontWeight: "600" },
  rowErrorText: { color: theme.colors.error, fontSize: 12, fontWeight: "600" },
});
