import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { formatCurrency } from "../../../../src/lib/currency";
import { PAYMENT_METHOD_LABELS } from "../../../../src/lib/invoice";
import { Button } from "../../../../src/components/button";
import { can } from "../../../../src/lib/permissions";
import { theme } from "../../../../src/lib/theme";

type StaffSales = { name: string; orderCount: number; total: number };

type ReportData = {
  total_sales: number;
  order_count: number;
  avg_order_value: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  top_products: { name: string; quantity_sold: number; revenue: number }[];
  expense_categories: { category: string; total: number }[];
  payment_breakdown: Record<string, number>;
};

type RangeOption = "today" | "7days" | "30days" | "custom";

function toISODate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const webDateInputStyle = {
  flex: 1,
  marginRight: theme.spacing.sm,
  padding: theme.spacing.sm,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.md,
  backgroundColor: theme.colors.surface,
  color: theme.colors.text,
  font: "inherit",
};

export default function Reports() {
  const { business, permissions } = useBusiness();
  const [range, setRange] = useState<RangeOption>("7days");
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [staffSales, setStaffSales] = useState<StaffSales[]>([]);
  const [loading, setLoading] = useState(false);

  function getDateRange(): [string, string] {
    const today = new Date();
    if (range === "today") {
      const iso = toISODate(today);
      return [iso, iso];
    }
    if (range === "7days") {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return [toISODate(start), toISODate(today)];
    }
    if (range === "30days") {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return [toISODate(start), toISODate(today)];
    }
    return [toISODate(customStart), toISODate(customEnd)];
  }

  const load = useCallback(async () => {
    if (!business) return;
    const [start, end] = getDateRange();
    setLoading(true);
    const { data, error } = await supabase.rpc("get_report", {
      p_business_id: business.id,
      p_start_date: start,
      p_end_date: end,
    });
    setLoading(false);
    if (error) {
      console.log("Error fetching report:", error.message);
      showAlert("Error", error.message);
      return;
    }
    setReport(data);

    if (business) {
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("total, created_by, creator:profiles!created_by(full_name)")
        .eq("business_id", business.id)
        .neq("status", "cancelled")
        .gte("created_at", `${start}T00:00:00+05:00`)
        .lte("created_at", `${end}T23:59:59+05:00`);
      if (ordersError) console.log("Error fetching staff sales:", ordersError.message);

      const byStaff = new Map<string, StaffSales>();
      for (const o of (orders as any[]) ?? []) {
        const key = o.created_by ?? "unknown";
        const name = o.creator?.full_name ?? "Unknown";
        const existing = byStaff.get(key) ?? { name, orderCount: 0, total: 0 };
        existing.orderCount += 1;
        existing.total += Number(o.total);
        byStaff.set(key, existing);
      }
      setStaffSales(Array.from(byStaff.values()).sort((a, b) => b.total - a.total));
    }
  }, [range, customStart, customEnd, business?.id]);

  useEffect(() => {
    load();
  }, [range]);

  if (!can(permissions, "reports", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view reports.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.rangeRow}>
        {(["today", "7days", "30days", "custom"] as RangeOption[]).map((r) => (
          <Pressable
            key={r}
            style={[styles.rangeButton, range === r && styles.rangeButtonActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>
              {r === "today" ? "Today" : r === "7days" ? "7 Days" : r === "30days" ? "30 Days" : "Custom"}
            </Text>
          </Pressable>
        ))}
      </View>

      {range === "custom" && (
        <View style={styles.customRow}>
          {Platform.OS === "web" ? (
            <>
              <input
                type="date"
                value={toISODate(customStart)}
                onChange={(e: any) => e.target.value && setCustomStart(new Date(e.target.value + "T00:00:00"))}
                style={webDateInputStyle}
              />
              <input
                type="date"
                value={toISODate(customEnd)}
                onChange={(e: any) => e.target.value && setCustomEnd(new Date(e.target.value + "T00:00:00"))}
                style={webDateInputStyle}
              />
            </>
          ) : (
            <>
              <Pressable style={[styles.input, { flex: 1, marginRight: theme.spacing.sm }]} onPress={() => setShowStartPicker(true)}>
                <Text style={styles.dateText}>{toISODate(customStart)}</Text>
              </Pressable>
              <Pressable style={[styles.input, { flex: 1, marginRight: theme.spacing.sm }]} onPress={() => setShowEndPicker(true)}>
                <Text style={styles.dateText}>{toISODate(customEnd)}</Text>
              </Pressable>
              {showStartPicker && (
                <DateTimePicker
                  value={customStart}
                  mode="date"
                  display="default"
                  onChange={(_event, selected) => {
                    setShowStartPicker(false);
                    if (selected) setCustomStart(selected);
                  }}
                />
              )}
              {showEndPicker && (
                <DateTimePicker
                  value={customEnd}
                  mode="date"
                  display="default"
                  onChange={(_event, selected) => {
                    setShowEndPicker(false);
                    if (selected) setCustomEnd(selected);
                  }}
                />
              )}
            </>
          )}
          <Button title="Go" size="sm" onPress={load} />
        </View>
      )}

      {loading || !report ? (
        <Text style={styles.empty}>Loading...</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Sales</Text>
          <View style={styles.card}>
            <Row label="Total Sales" value={formatCurrency(report.total_sales)} />
            <Row label="Orders" value={String(report.order_count)} />
            <Row label="Average Order Value" value={formatCurrency(report.avg_order_value)} />
          </View>

          <Text style={styles.sectionTitle}>Profit</Text>
          <View style={styles.card}>
            <Row label="Revenue" value={formatCurrency(report.revenue)} />
            <Row label="COGS" value={formatCurrency(report.cogs)} />
            <Row label="Gross Profit" value={formatCurrency(report.gross_profit)} />
            <Row label="Expenses" value={formatCurrency(report.expenses)} />
            <Row label="Net Profit" value={formatCurrency(report.net_profit)} bold />
          </View>

          <Text style={styles.sectionTitle}>Top Products</Text>
          <View style={styles.card}>
            {report.top_products.length === 0 ? (
              <Text style={styles.emptyInline}>No sales in this period.</Text>
            ) : (
              report.top_products.map((p, i) => (
                <Row key={i} label={`${p.name} (×${p.quantity_sold})`} value={formatCurrency(p.revenue)} />
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Expenses by Category</Text>
          <View style={styles.card}>
            {report.expense_categories.length === 0 ? (
              <Text style={styles.emptyInline}>No expenses in this period.</Text>
            ) : (
              report.expense_categories.map((c, i) => <Row key={i} label={c.category} value={formatCurrency(c.total)} />)
            )}
          </View>

          <Text style={styles.sectionTitle}>Sales by Team Member</Text>
          <View style={styles.card}>
            {staffSales.length === 0 ? (
              <Text style={styles.emptyInline}>No sales in this period.</Text>
            ) : (
              staffSales.map((s, i) => (
                <Row key={i} label={`${s.name} (${s.orderCount} order${s.orderCount === 1 ? "" : "s"})`} value={formatCurrency(s.total)} />
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Net Collection by Method</Text>
          <View style={styles.card}>
            {Object.keys(report.payment_breakdown ?? {}).length === 0 ? (
              <Text style={styles.emptyInline}>No payments in this period.</Text>
            ) : (
              Object.entries(report.payment_breakdown ?? {}).map(([method, amount]) => (
                <Row key={method} label={PAYMENT_METHOD_LABELS[method] ?? method} value={formatCurrency(Number(amount))} />
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
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
  rangeRow: { flexDirection: "row", marginBottom: theme.spacing.md },
  rangeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    marginRight: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  rangeButtonActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  rangeText: { fontSize: 12, color: theme.colors.text },
  rangeTextActive: { color: "#fff", fontWeight: "600" },
  customRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  dateText: { color: theme.colors.text, textAlign: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: theme.spacing.xs },
  rowLabel: { color: theme.colors.muted, flex: 1 },
  rowLabelBold: { color: theme.colors.text, fontWeight: "700" },
  rowValue: { color: theme.colors.text, fontWeight: "600" },
  rowValueBold: { color: theme.colors.text, fontWeight: "700" },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
  emptyInline: { color: theme.colors.muted },
});
