import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { can, GranularPermissions } from "../../../../src/lib/permissions";
import { PermissionsGrid } from "../../../../src/components/permissions-grid";
import { Button } from "../../../../src/components/button";
import { theme } from "../../../../src/lib/theme";

export default function EditTeamMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role: myRole, permissions: myPermissions } = useBusiness();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState<GranularPermissions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("business_members")
      .select("role, permissions, profiles(full_name)")
      .eq("id", id)
      .maybeSingle();
    if (error) console.log("Error fetching team member:", error.message);
    if (data) {
      setName((data as any).profiles?.full_name ?? "Team member");
      setRole(data.role);
      setPermissions((data.permissions as GranularPermissions) ?? {});
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.rpc("update_member_permissions", {
      p_member_id: id,
      p_permissions: permissions,
    });
    setSaving(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    router.back();
  }

  function handlePromote() {
    showAlert(
      "Make Co-Owner?",
      `${name} will get full, permanent access equal to yours. There is currently no way to undo this or remove them from the app — that would need to be done directly in the database. Only proceed if you're sure.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Co-Owner",
          style: "destructive",
          onPress: async () => {
            setPromoting(true);
            const { error } = await supabase.rpc("promote_to_co_owner", { p_member_id: id });
            setPromoting(false);
            if (error) {
              showAlert("Error", error.message);
              return;
            }
            showAlert("Done", `${name} is now a co-owner.`);
            load();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>Loading...</Text>
      </View>
    );
  }

  if (!can(myPermissions, "team", "edit")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to edit team members.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.roleText}>{role}</Text>

      <Text style={styles.label}>What can they access?</Text>
      <PermissionsGrid permissions={permissions} onChange={setPermissions} />

      <Button
        title={saving ? "Saving..." : "Save Permissions"}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: theme.spacing.lg }}
      />

      {myRole === "Owner" && role !== "Owner" && (
        <Button
          title="Make Co-Owner"
          variant="outline"
          loading={promoting}
          onPress={handlePromote}
          style={{ borderColor: theme.colors.warning, marginTop: theme.spacing.md }}
          textStyle={{ color: theme.colors.warning }}
        />
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
  name: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  roleText: { color: theme.colors.muted, marginBottom: theme.spacing.lg },
  label: { fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: theme.spacing.sm },
});
