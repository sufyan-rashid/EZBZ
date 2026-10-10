import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { theme } from "../../../../src/lib/theme";
import { can, GranularPermissions } from "../../../../src/lib/permissions";
import { PermissionsGrid } from "../../../../src/components/permissions-grid";
import { Button } from "../../../../src/components/button";

const ROLE_PRESETS: { label: string; permissions: GranularPermissions }[] = [
  { label: "Cashier", permissions: { orders: { view: true, add: true } } },
  {
    label: "Manager",
    permissions: {
      dashboard: { view: true },
      orders: { view: true, add: true, edit: true, delete: true },
      customers: { view: true, add: true, edit: true },
      products: { view: true, add: true, edit: true },
      inventory: { view: true, edit: true },
      expenses: { view: true, add: true, edit: true },
      reports: { view: true },
      returns: { view: true, add: true },
    },
  },
];

export default function InviteTeamMember() {
  const router = useRouter();
  const { business, permissions: myPermissions } = useBusiness();
  const [email, setEmail] = useState("");
  const [roleLabel, setRoleLabel] = useState("Staff");
  const [permissions, setPermissions] = useState<GranularPermissions>({});
  const [loading, setLoading] = useState(false);

  function applyPreset(preset: (typeof ROLE_PRESETS)[number]) {
    setRoleLabel(preset.label);
    setPermissions(preset.permissions);
  }

  async function handleInvite() {
    if (!business) return;
    if (!email.trim() || !email.includes("@")) {
      return showAlert("Missing info", "Enter a valid email address.");
    }
    setLoading(true);
    const { error } = await supabase.rpc("invite_team_member", {
      p_business_id: business.id,
      p_email: email.trim().toLowerCase(),
      p_permissions: permissions,
      p_role_label: roleLabel.trim() || "Staff",
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("User limit reached")) {
        showAlert(
          "Seat limit reached",
          "Your plan doesn't have any free team seats left. Contact EZBZ support to add more.",
        );
      } else {
        showAlert("Error", error.message);
      }
      return;
    }
    showAlert("Invited", `An invitation was created for ${email.trim()}. They'll join automatically when they sign up with this email.`);
    router.back();
  }

  if (!can(myPermissions, "team", "add")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to invite team members.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Team member's email *"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Role label (e.g. Cashier)"
        value={roleLabel}
        onChangeText={setRoleLabel}
      />

      <View style={styles.presetRow}>
        {ROLE_PRESETS.map((preset) => (
          <Pressable key={preset.label} style={styles.presetButton} onPress={() => applyPreset(preset)}>
            <Text style={styles.presetButtonText}>{preset.label} preset</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>What can they access?</Text>
      <PermissionsGrid permissions={permissions} onChange={setPermissions} />

      <Button
        title={loading ? "Sending..." : "Send Invitation"}
        onPress={handleInvite}
        loading={loading}
        style={{ marginTop: theme.spacing.lg }}
      />
      <Text style={styles.footNote}>
        Nothing is granted by default — pick exactly what this person can access.
      </Text>
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
  presetRow: { flexDirection: "row", marginBottom: theme.spacing.lg },
  presetButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginRight: theme.spacing.sm,
  },
  presetButtonText: { color: theme.colors.primary, fontWeight: "600", fontSize: 12 },
  label: { fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: theme.spacing.sm },
  footNote: { color: theme.colors.muted, fontSize: 12, textAlign: "center", marginTop: theme.spacing.sm },
});
