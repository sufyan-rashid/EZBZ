import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useAuth } from "../../../src/hooks/useAuth";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

// Every logged-in user can reach this screen regardless of what business
// permissions they've been granted — it's their own account, not a business
// setting an owner controls. See src/lib/permissions.ts for the "settings"
// feature, which gates Business Settings / Data instead.
export default function MyAccount() {
  const { session } = useAuth();

  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (session) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) console.log("Error fetching profile:", error.message);
          setFullName(data?.full_name ?? "");
        });
    }
  }, [session]);

  async function handleSaveProfile() {
    if (!fullName.trim() || !session) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", session.user.id);
    setSavingProfile(false);
    if (error) showAlert("Error", error.message);
    else showAlert("Saved", "Name updated.");
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) return showAlert("Too short", "Password must be at least 6 characters.");
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) showAlert("Error", error.message);
    else {
      showAlert("Success", "Password changed.");
      setNewPassword("");
    }
  }

  function handleLogout() {
    showAlert("Log out?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  function handleDeleteAccount() {
    showAlert(
      "Delete Account",
      "This logs you out. Your business data stays safe and is never deleted this way. For a permanent account deletion, please contact support — that part isn't automated yet.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: () => supabase.auth.signOut() },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.readonlyLabel}>Email</Text>
        <Text style={styles.readonlyValue}>{session?.user.email}</Text>
        <TextInput
          style={[styles.input, { marginTop: theme.spacing.md }]}
          placeholder="Full Name"
          value={fullName}
          onChangeText={setFullName}
        />
        <Button
          title={savingProfile ? "Saving..." : "Save Name"}
          onPress={handleSaveProfile}
          loading={savingProfile}
        />
      </View>

      <Text style={styles.sectionTitle}>Change Password</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="New Password"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <Button
          title={changingPassword ? "Changing..." : "Change Password"}
          onPress={handleChangePassword}
          loading={changingPassword}
        />
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteButtonText}>Delete Account</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  readonlyLabel: { color: theme.colors.muted, fontSize: 12 },
  readonlyValue: { color: theme.colors.text, fontSize: 15, marginTop: 2 },
  logoutButton: { padding: theme.spacing.md, alignItems: "center", marginTop: theme.spacing.xl },
  logoutButtonText: { color: theme.colors.text, fontWeight: "600" },
  deleteButton: { padding: theme.spacing.md, alignItems: "center" },
  deleteButtonText: { color: theme.colors.error, fontWeight: "600" },
});
