import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet  } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { SegmentedControl } from "../../../../src/components/segmented-control";
import { getEffectiveStatus, EffectiveSubscriptionStatus } from "../../../../src/lib/subscriptionStatus";
import { Button } from "../../../../src/components/button";
import { theme } from "../../../../src/lib/theme";

const STATUS_SECTIONS: { key: EffectiveSubscriptionStatus; label: string; color: string }[] = [
  { key: "active", label: "Active", color: theme.colors.success },
  { key: "trial", label: "Trial", color: theme.colors.secondary },
  { key: "expired", label: "Expired", color: theme.colors.error },
  { key: "cancelled", label: "Cancelled", color: theme.colors.muted },
  { key: "pending", label: "No Subscription Yet", color: theme.colors.warning },
];

const STATUS_OPTIONS = [
  { label: "Trial", value: "trial" },
  { label: "Active", value: "active" },
  { label: "Expired", value: "expired" },
  { label: "Cancelled", value: "cancelled" },
] as const;

type BusinessRow = {
  business_id: string;
  business_name: string;
  owner_name: string;
  owner_email: string;
  plan: string;
  status: string;
  max_users: number;
  expiry_date: string | null;
  member_count: number;
};

export default function AdminPanel() {
  const { isPlatformAdmin } = useBusiness();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BusinessRow | null>(null);
  const [maxUsers, setMaxUsers] = useState("");
  const [status, setStatus] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [allBusinesses, setAllBusinesses] = useState<BusinessRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [expandedSection, setExpandedSection] = useState<EffectiveSubscriptionStatus | null>(null);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    const { data, error } = await supabase.rpc("admin_list_all_businesses");
    setLoadingAll(false);
    if (error) {
      console.log("Error loading all businesses:", error.message);
      return;
    }
    setAllBusinesses(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const sections = useMemo(() => {
    const groups = new Map<EffectiveSubscriptionStatus, BusinessRow[]>();
    for (const row of allBusinesses) {
      const effective = getEffectiveStatus(row.status, row.expiry_date);
      if (!groups.has(effective)) groups.set(effective, []);
      groups.get(effective)!.push(row);
    }
    return STATUS_SECTIONS.map((s) => ({ ...s, rows: groups.get(s.key) ?? [] })).filter(
      (s) => s.rows.length > 0,
    );
  }, [allBusinesses]);

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_find_business", { p_search: search.trim() });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    setResults(data ?? []);
  }

  function selectBusiness(row: BusinessRow) {
    setSelected(row);
    setMaxUsers(String(row.max_users ?? 1));
    const effective = getEffectiveStatus(row.status, row.expiry_date);
    setStatus(effective === "pending" ? "trial" : effective);
    setExpiryDate(row.expiry_date ? row.expiry_date.slice(0, 10) : "");
    setAmount("");
  }

  async function handleSave() {
    if (!selected) return;
    const maxUsersNum = parseInt(maxUsers, 10);
    if (isNaN(maxUsersNum) || maxUsersNum < 1) {
      return showAlert("Invalid", "Seat limit must be 1 or more.");
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_subscription", {
      p_business_id: selected.business_id,
      p_max_users: maxUsersNum,
      p_status: status,
      p_expiry_date: expiryDate || null,
      p_amount: amount ? parseFloat(amount) : null,
    });
    setSaving(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    showAlert("Saved", `${selected.business_name}'s subscription was updated.`);
    loadAll();
    if (search.trim()) handleSearch();
  }

  if (!isPlatformAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view this page.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.warning}>Platform admin only — changes apply immediately.</Text>
      <View style={styles.headerRow}>
        <TextInput
          style={styles.search}
          placeholder="Search business name, owner name, or email..."
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
        />
        <Button title="Search" size="sm" loading={loading} onPress={handleSearch} />
      </View>

      {!selected ? (
        search.trim() ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.business_id}
            ListEmptyComponent={<Text style={styles.empty}>No businesses match this search.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => selectBusiness(item)}>
                <Text style={styles.name}>{item.business_name}</Text>
                <Text style={styles.detail}>
                  {item.owner_name} · {item.owner_email}
                </Text>
                <Text style={styles.detail}>
                  {item.member_count} members · {item.max_users} seats ·{" "}
                  {getEffectiveStatus(item.status, item.expiry_date)}
                </Text>
              </Pressable>
            )}
          />
        ) : (
          <ScrollView>
            {loadingAll ? (
              <Text style={styles.empty}>Loading businesses...</Text>
            ) : sections.length === 0 ? (
              <Text style={styles.empty}>No businesses yet.</Text>
            ) : (
              sections.map((section) => {
                const isOpen = expandedSection === section.key;
                return (
                  <View key={section.key} style={styles.sectionBlock}>
                    <Pressable
                      style={styles.sectionHeader}
                      onPress={() => setExpandedSection(isOpen ? null : section.key)}
                    >
                      <View style={styles.sectionHeaderLeft}>
                        <View style={[styles.statusDot, { backgroundColor: section.color }]} />
                        <Text style={styles.sectionTitle}>{section.label}</Text>
                      </View>
                      <Text style={styles.sectionCount}>
                        {section.rows.length} {isOpen ? "▾" : "▸"}
                      </Text>
                    </Pressable>
                    {isOpen &&
                      section.rows.map((item) => (
                        <Pressable
                          key={item.business_id}
                          style={styles.card}
                          onPress={() => selectBusiness(item)}
                        >
                          <Text style={styles.name}>{item.business_name}</Text>
                          <Text style={styles.detail}>
                            {item.owner_name} · {item.owner_email}
                          </Text>
                          <Text style={styles.detail}>
                            {item.member_count} members · {item.max_users ?? "—"} seats
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.editCard} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.backLink}>‹ Back to search</Text>
          </Pressable>
          <Text style={styles.name}>{selected.business_name}</Text>
          <Text style={styles.detail}>
            {selected.owner_name} · {selected.owner_email}
          </Text>

          <Text style={styles.label}>Seat Limit (max team members incl. owner)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={maxUsers}
            onChangeText={setMaxUsers}
          />

          <Text style={styles.label}>Status</Text>
          <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} />

          <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} />

          <Text style={styles.label}>Amount Paid (Rs., optional)</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

          <Button
            title={saving ? "Saving..." : "Save Subscription"}
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: theme.spacing.lg }}
          />
        </ScrollView>
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
  warning: { color: theme.colors.warning, fontSize: 12, marginBottom: theme.spacing.md, fontWeight: "600" },
  sectionBlock: { marginBottom: theme.spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: theme.spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  sectionCount: { color: theme.colors.muted, fontWeight: "600" },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
  },
  empty: { color: theme.colors.muted, textAlign: "center", marginTop: theme.spacing.xl },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  name: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  detail: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  editCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  backLink: { color: theme.colors.secondary, fontWeight: "600", marginBottom: theme.spacing.md },
  label: { color: theme.colors.muted, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
});
