import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
} from "react-native";
import { useAuth } from "../../src/hooks/useAuth";
import { useBusiness } from "../../src/hooks/useBusiness";
import { supabase } from "../../src/lib/supabase";
import { showAlert } from "../../src/lib/alert";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

export default function BusinessInfo() {
  const router = useRouter();
  const { session } = useAuth();
  const { refreshBusiness, switchBusiness } = useBusiness();
  const [name, setName] = useState(
    session?.user?.user_metadata?.business_name ?? "",
  );
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!name) {
      showAlert("Missing info", "Business name is required.");
      return;
    }
    setLoading(true);
    const { data: newBusinessId, error } = await supabase.rpc("create_business_for_new_user", {
      p_name: name,
      p_category: category || null,
      p_phone: phone || null,
      p_address: address || null,
      p_currency: "PKR",
    });
    setLoading(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    await refreshBusiness();
    if (newBusinessId) await switchBusiness(newBusinessId);
    router.push("/(onboarding)/first-product");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tell us about your business</Text>
      <TextInput
        style={styles.input}
        placeholder="Business Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Category (e.g. Clothing, Jewelry)"
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Address"
        value={address}
        onChangeText={setAddress}
      />
      <Text style={styles.hint}>Currency: PKR (fixed for now)</Text>
      <Button
        title={loading ? "Saving..." : "Continue"}
        onPress={handleContinue}
        loading={loading}
        style={{ marginTop: theme.spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  hint: { color: theme.colors.muted, marginBottom: theme.spacing.md },
});
