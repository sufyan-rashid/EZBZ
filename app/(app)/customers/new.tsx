import { useState } from "react";
import { View, TextInput, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { showAlert } from "../../../src/lib/alert";
import { useAuth } from "../../../src/hooks/useAuth";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { addPendingCustomer } from "../../../src/lib/offlineQueue";
import { can } from "../../../src/lib/permissions";
import { Button } from "../../../src/components/button";
import { theme } from "../../../src/lib/theme";

export default function NewCustomer() {
  const { session } = useAuth();
  const { business, permissions } = useBusiness();
  const { isConnected } = useNetwork();
  const { refresh: refreshOfflineSync } = useOfflineSync();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!name.trim()) return showAlert("Missing info", "Customer name is required.");
    if (!business || !session) return;

    if (!isConnected) {
      setLoading(true);
      await addPendingCustomer(business.id, session.user.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: notes.trim(),
      });
      await refreshOfflineSync();
      setLoading(false);
      showAlert(
        "Saved Offline",
        `${name.trim()} is saved on this device and will sync automatically once you're back online.`,
      );
      router.back();
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("customers").insert({
      business_id: business.id,
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    router.back();
  }

  if (!can(permissions, "customers", "add")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to add customers.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput style={styles.input} placeholder="Name *" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Address" value={address} onChangeText={setAddress} />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Notes"
        multiline
        value={notes}
        onChangeText={setNotes}
      />
      <Button
        title={loading ? "Saving..." : !isConnected ? "Save Customer (Offline)" : "Save Customer"}
        onPress={handleSave}
        loading={loading}
        style={{ marginTop: theme.spacing.sm }}
      />
      {!isConnected && (
        <Text style={styles.offlineHint}>
          You&apos;re offline — this customer will be saved on this device and synced automatically once you&apos;re
          back online.
        </Text>
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
  offlineHint: {
    color: theme.colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: theme.spacing.sm,
  },
});
