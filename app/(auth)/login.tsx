import { Link } from "expo-router";
import { useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { showAlert } from "../../src/lib/alert";
import { supabase } from "../../src/lib/supabase";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    // Device-session claiming happens once, centrally, in useAuth's
    // onAuthStateChange listener (which fires for this sign-in too) —
    // claiming it again here raced with that and occasionally 401'd.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) showAlert("Login failed", error.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to EZBZ</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title={loading ? "Logging in..." : "Log In"}
        onPress={handleLogin}
        loading={loading}
        style={{ marginTop: theme.spacing.sm }}
      />
      <Link href="/(auth)/forgot-password" style={styles.link}>
        Forgot password?
      </Link>
      <Link href="/(auth)/signup" style={styles.link}>
        Don&apos;t have an account? Sign up
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
