import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { supabase } from "../../../src/lib/supabase";
import { can } from "../../../src/lib/permissions";
import { formatCurrency } from "../../../src/lib/currency";
import { PAYMENT_METHOD_LABELS } from "../../../src/lib/invoice";
import { theme } from "../../../src/lib/theme";

type Stats = {
  today_sales: number;
  today_orders: number;
  today_expenses: number;
  today_profit: number;
  total_outstanding: number;
  payment_breakdown: Record<string, number>;
};
type ChartDay = { day: string; total: number };
type LowStockProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
};
type RecentOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  customers: { name: string } | null;
};

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { business, permissions } = useBusiness();
  const canSeeFinancials = can(permissions, "reports", "view");
  const canViewOrders = can(permissions, "orders", "view");
  const canAddOrder = can(permissions, "orders", "add");
  const canAddProduct = can(permissions, "products", "add");
  const canAddCustomer = can(permissions, "customers", "add");
  const canAddExpense = can(permissions, "expenses", "add");
  const canAddReturn = can(permissions, "returns", "add");
  const router = useRouter();
  const { isConnected } = useNetwork();
  const { pendingOrderCount, pendingOrderTotal, pendingReturnCount, pendingCustomerCount, pendingPaymentCount } =
    useOfflineSync();
  const [stats, setStats] = useState<Stats | null>(null);
  const [chartDays, setChartDays] = useState<7 | 30>(7);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  const load = useCallback(async () => {
    if (!business) return;

    const { data: statsData, error: statsError } = await supabase.rpc("get_dashboard_stats", {
      p_business_id: business.id,
    });
    if (statsError) console.log("Error fetching dashboard stats:", statsError.message);
    if (statsData && statsData[0]) setStats(statsData[0]);

    const { data: chart, error: chartError } = await supabase.rpc("get_sales_chart", {
      p_business_id: business.id,
      p_days: chartDays,
    });
    if (chartError) console.log("Error fetching sales chart:", chartError.message);
    setChartData(chart ?? []);

    const { data: lowStockData, error: lowStockError } = await supabase
      .from("products")
      .select("id, name, stock_quantity, low_stock_threshold")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("stock_quantity", { ascending: true })
      .limit(20);
    if (lowStockError) console.log("Error fetching low stock products:", lowStockError.message);
    const allLowStock = (lowStockData ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold);
    setLowStockCount(allLowStock.length);
    setLowStock(allLowStock.slice(0, 5));

    const { data: recentData, error: recentError } = await supabase
      .from("orders")
      .select("id, order_number, status, total, customers(name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentError) console.log("Error fetching recent orders:", recentError.message);
    setRecentOrders((recentData as any) ?? []);
  }, [business?.id, chartDays]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const maxChartValue = Math.max(...chartData.map((d) => Number(d.total)), 1);

  if (!can(permissions, "dashboard", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view the dashboard.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <Text style={styles.greeting}>Hi, {business?.name ?? "there"} 👋</Text>

      {!isConnected && (
        <View style={styles.offlineModeBanner}>
          <Text style={styles.offlineModeBannerText}>
            📴 You&apos;re offline — sales and returns are being saved on this device and will sync automatically.
          </Text>
        </View>
      )}

      {(() => {
        const parts: string[] = [];
        if (pendingOrderCount > 0) parts.push(`${pendingOrderCount} sale${pendingOrderCount === 1 ? "" : "s"}`);
        if (pendingReturnCount > 0) parts.push(`${pendingReturnCount} return${pendingReturnCount === 1 ? "" : "s"}`);
        if (pendingCustomerCount > 0)
          parts.push(`${pendingCustomerCount} customer${pendingCustomerCount === 1 ? "" : "s"}`);
        if (pendingPaymentCount > 0)
          parts.push(`${pendingPaymentCount} payment${pendingPaymentCount === 1 ? "" : "s"}`);
        if (parts.length === 0) return null;
        const label =
          parts.length === 1
            ? parts[0]
            : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
        const totalCount = pendingOrderCount + pendingReturnCount + pendingCustomerCount + pendingPaymentCount;
        return (
          <Pressable style={styles.pendingBanner} onPress={() => router.push("/(app)/more/pending-sync")}>
            <Text style={styles.pendingBannerText}>
              ⏳ {label} waiting to sync
              {pendingOrderTotal > 0 ? ` (~${formatCurrency(pendingOrderTotal)})` : ""} — today&apos;s numbers below
              don&apos;t include {totalCount === 1 ? "it" : "them"} yet. Tap to review.
            </Text>
          </Pressable>
        );
      })()}

      {lowStockCount > 0 && (
        <Pressable style={styles.lowStockBanner} onPress={() => router.push("/(app)/products")}>
          <Text style={styles.lowStockBannerText}>
            ⚠ {lowStockCount} product{lowStockCount === 1 ? " is" : "s are"} low or out of stock
          </Text>
        </Pressable>
      )}

      <View style={styles.statsGrid}>
        <Pressable
          style={styles.statCard}
          onPress={() => canViewOrders && router.push("/(app)/orders")}
        >
          <Text style={styles.statValue}>{formatCurrency(stats?.today_sales ?? 0)}</Text>
          <Text style={styles.statLabel}>Today&apos;s Sales</Text>
        </Pressable>
        <Pressable
          style={styles.statCard}
          onPress={() => canViewOrders && router.push("/(app)/orders")}
        >
          <Text style={styles.statValue}>{stats?.today_orders ?? 0}</Text>
          <Text style={styles.statLabel}>Today&apos;s Orders</Text>
        </Pressable>
        {canSeeFinancials && (
          <>
            <Pressable
              style={styles.statCard}
              onPress={() => can(permissions, "expenses", "view") && router.push("/(app)/more/expenses")}
            >
              <Text style={styles.statValue}>{formatCurrency(stats?.today_expenses ?? 0)}</Text>
              <Text style={styles.statLabel}>Today&apos;s Expenses</Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => router.push("/(app)/more/reports")}>
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      (stats?.today_profit ?? 0) >= 0
                        ? theme.colors.success
                        : theme.colors.error,
                  },
                ]}
              >
                {formatCurrency(stats?.today_profit ?? 0)}
              </Text>
              <Text style={styles.statLabel}>Today&apos;s Profit</Text>
            </Pressable>
            <Pressable
              style={styles.statCard}
              onPress={() => can(permissions, "customers", "view") && router.push("/(app)/customers")}
            >
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      (stats?.total_outstanding ?? 0) > 0
                        ? theme.colors.warning
                        : theme.colors.text,
                  },
                ]}
              >
                {formatCurrency(stats?.total_outstanding ?? 0)}
              </Text>
              <Text style={styles.statLabel}>Outstanding Receivables</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sales Overview</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setChartDays(7)}
            style={[
              styles.toggleButton,
              chartDays === 7 && styles.toggleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                chartDays === 7 && styles.toggleTextActive,
              ]}
            >
              7 Days
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setChartDays(30)}
            style={[
              styles.toggleButton,
              chartDays === 30 && styles.toggleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                chartDays === 30 && styles.toggleTextActive,
              ]}
            >
              30 Days
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.chart}>
        {chartData.map((d) => {
          const now = new Date();
          const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const isToday = d.day === todayLocal;
          const dayLabel = new Date(d.day + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "short",
          });
          return (
            <View key={d.day} style={styles.chartBarWrapper}>
              {chartDays === 7 && Number(d.total) > 0 && (
                <Text style={styles.chartValue} numberOfLines={1}>
                  {Number(d.total) >= 1000 ? `${(Number(d.total) / 1000).toFixed(1)}k` : Number(d.total)}
                </Text>
              )}
              <View
                style={[
                  styles.chartBar,
                  isToday && styles.chartBarToday,
                  { height: Math.max((Number(d.total) / maxChartValue) * 80, 2) },
                ]}
              />
              {chartDays === 7 && (
                <Text style={[styles.chartDayLabel, isToday && styles.chartDayLabelToday]}>
                  {dayLabel}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Today&apos;s Collection by Method</Text>
      <View style={styles.card}>
        {Object.keys(stats?.payment_breakdown ?? {}).length === 0 ? (
          <Text style={styles.empty}>No sales yet today.</Text>
        ) : (
          Object.entries(stats?.payment_breakdown ?? {}).map(
            ([method, amount]) => (
              <View key={method} style={styles.listRow}>
                <Text style={styles.listRowText}>
                  {PAYMENT_METHOD_LABELS[method] ?? method}
                </Text>
                <Text style={styles.listRowText}>{formatCurrency(amount as number)}</Text>
              </View>
            ),
          )
        )}
        {Object.keys(stats?.payment_breakdown ?? {}).length > 0 && (
          <Text style={styles.breakdownHint}>Money received minus refunds paid out today.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Low Stock Products</Text>
      {lowStock.length === 0 ? (
        <Text style={styles.empty}>Nothing low on stock right now.</Text>
      ) : (
        lowStock.map((p) => (
          <View key={p.id} style={styles.listRow}>
            <Text style={styles.listRowText}>{p.name}</Text>
            <Text style={styles.listRowWarning}>{p.stock_quantity} left</Text>
          </View>
        ))
      )}

      {canViewOrders && (
        <>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          {recentOrders.length === 0 ? (
            <Text style={styles.empty}>No orders yet.</Text>
          ) : (
            recentOrders.map((o) => (
              <Pressable
                key={o.id}
                style={styles.listRow}
                onPress={() => router.push(`/(app)/orders/${o.id}`)}
              >
                <Text style={styles.listRowText}>
                  {o.order_number} — {o.customers?.name ?? "Walk-in"}
                </Text>
                <Text style={styles.listRowText}>{formatCurrency(o.total)}</Text>
              </Pressable>
            ))
          )}
        </>
      )}

      {(canAddOrder || canAddProduct || canAddCustomer || canAddExpense || canAddReturn) && (
        <>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            {canAddOrder && (
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push("/(app)/orders/new")}
              >
                <Text style={styles.quickActionText}>+ Order</Text>
              </Pressable>
            )}
            {canAddProduct && (
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push("/(app)/products/new")}
              >
                <Text style={styles.quickActionText}>+ Product</Text>
              </Pressable>
            )}
            {canAddCustomer && (
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push("/(app)/customers/new")}
              >
                <Text style={styles.quickActionText}>+ Customer</Text>
              </Pressable>
            )}
            {canAddExpense && (
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push("/(app)/more/expenses/new")}
              >
                <Text style={styles.quickActionText}>+ Expense</Text>
              </Pressable>
            )}
            {canAddReturn && (
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push("/(app)/more/returns/new")}
              >
                <Text style={styles.quickActionText}>+ Return</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  offlineModeBanner: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  offlineModeBannerText: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 12 },
  pendingBanner: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  pendingBannerText: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 12 },
  lowStockBanner: {
    backgroundColor: theme.colors.warning,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  lowStockBannerText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    width: "48%",
    minHeight: 72,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    justifyContent: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  toggleRow: { flexDirection: "row" },
  toggleButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  toggleText: { fontSize: 12, color: theme.colors.text },
  toggleTextActive: { color: "#fff" },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 120,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: 100,
  },
  chartValue: { fontSize: 9, color: theme.colors.muted, marginBottom: 2 },
  chartBar: {
    width: "60%",
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  chartBarToday: { backgroundColor: theme.colors.success },
  chartDayLabel: { fontSize: 9, color: theme.colors.muted, marginTop: 4 },
  chartDayLabelToday: { color: theme.colors.success, fontWeight: "700" },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  empty: { color: theme.colors.muted },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  listRowText: { color: theme.colors.text },
  breakdownHint: { color: theme.colors.muted, fontSize: 11, marginTop: theme.spacing.xs },
  listRowWarning: { color: theme.colors.warning, fontWeight: "600" },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  quickAction: {
    width: "48%",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  quickActionText: { color: "#fff", fontWeight: "600" },
});
