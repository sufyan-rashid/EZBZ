import { Link } from "expo-router";
import { useState } from "react";
import {
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { showAlert } from "../../src/lib/alert";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

function getResetPasswordRedirectUrl() {
  if (Platform.OS === "web") {
    return (typeof window !== "undefined" ? window.location.origin : "") + "/reset-password";
  }
  return Linking.createURL("/reset-password");
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getResetPasswordRedirectUrl(),
    });
    setLoading(false);
    if (error) showAlert("Error", error.message);
    else showAlert("Check your email", "We sent you a password reset link.");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Button
        title={loading ? "Sending..." : "Send Reset Link"}
        onPress={handleReset}
        loading={loading}
        style={{ marginTop: theme.spacing.sm }}
      />
      <Link href="/(auth)/login" style={styles.link}>
        Back to login
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
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
  link: {
    color: theme.colors.secondary,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
});
