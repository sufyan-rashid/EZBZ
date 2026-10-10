import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { SearchInput } from "../../../../src/components/search-input";
import { Button } from "../../../../src/components/button";
import { formatCurrency } from "../../../../src/lib/currency";
import { theme } from "../../../../src/lib/theme";

type Expense = { id: string; title: string; category: string; amount: number; date: string };

function toLocalISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISODate(d);
}
function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  return toLocalISODate(new Date());
}

export default function ExpensesList() {
  const { business } = useBusiness();
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [totals, setTotals] = useState({ today: 0, week: 0, month: 0 });

  const load = useCallback(async () => {
    if (!business) return;

    let query = supabase
      .from("expenses")
      .select("id, title, category, amount, date")
      .eq("business_id", business.id)
      .order("date", { ascending: false });
    if (search.trim()) {
      query = query.ilike("title", `%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) console.log("Error fetching expenses:", error.message);
    setExpenses(data ?? []);

    const [{ data: todayData }, { data: weekData }, { data: monthData }] = await Promise.all([
      supabase.from("expenses").select("amount").eq("business_id", business.id).eq("date", today()),
      supabase.from("expenses").select("amount").eq("business_id", business.id).gte("date", dateNDaysAgo(7)),
      supabase.from("expenses").select("amount").eq("business_id", business.id).gte("date", startOfMonth()),
    ]);
    setTotals({
      today: (todayData ?? []).reduce((s, e) => s + Number(e.amount), 0),
      week: (weekData ?? []).reduce((s, e) => s + Number(e.amount), 0),
      month: (monthData ?? []).reduce((s, e) => s + Number(e.amount), 0),
    });
  }, [business?.id, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatCurrency(totals.today)}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatCurrency(totals.week)}</Text>
          <Text style={styles.statLabel}>Last 7 Days</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatCurrency(totals.month)}</Text>
          <Text style={styles.statLabel}>This Month</Text>
        </View>
      </View>

      <View style={styles.headerRow}>
        <SearchInput style={styles.search} placeholder="Search expenses..." value={search} onChangeText={setSearch} />
        <Button title="+ Add" size="sm" onPress={() => router.push("/(app)/more/expenses/new")} />
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No expenses yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(app)/more/expenses/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.category}>
                {item.category} · {item.date}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.lg },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statValue: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  search: {
    marginRight: theme.spacing.sm,
  },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  title: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  category: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  amount: { color: theme.colors.text, fontWeight: "600" },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
});
