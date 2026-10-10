import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../src/lib/supabase";
import { showAlert } from "../../src/lib/alert";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

// Supabase's default (non-customized) recovery email links back with the
// session tokens in a URL hash fragment (#access_token=...&type=recovery),
// not a query string, so expo-router's own param parsing never sees them —
// this has to be pulled out of the raw URL by hand.
function parseHashParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return {};
  const params: Record<string, string> = {};
  for (const pair of url.slice(hashIndex + 1).split("&")) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
  }
  return params;
}

export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const nativeUrl = Linking.useLinkingURL();
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{ access_token: string; refresh_token: string } | null>(null);

  // A completely separate client, isolated from the app's shared `supabase`
  // singleton, so establishing the recovery session here doesn't make the
  // rest of the app (which reacts to the shared client's session) think the
  // user is already logged in and navigate them into the dashboard mid-flow.
  // `persistSession: false` alone isn't enough for that isolation — GoTrue's
  // internal _saveSession still writes to `storage` unconditionally, and
  // without an explicit `storageKey` it defaults to the same localStorage key
  // as the main client, silently clobbering it. A private in-memory-only
  // storage sidesteps that entirely.
  const recoveryClient = useMemo(() => {
    const memoryStore = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => Promise.resolve(memoryStore.get(key) ?? null),
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
        return Promise.resolve();
      },
    };
    return createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: memoryStorage,
          storageKey: "ezbz-recovery-session",
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }, []);

  useEffect(() => {
    const rawUrl = Platform.OS === "web" ? (typeof window !== "undefined" ? window.location.href : "") : (nativeUrl ?? "");
    const hashParams = parseHashParams(rawUrl);
    const accessToken = hashParams.access_token;
    const refreshToken = hashParams.refresh_token;

    if (accessToken && refreshToken && hashParams.type === "recovery") {
      recoveryClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        setVerifying(false);
        if (error) {
          setVerifyError(true);
        } else {
          setRecoveryTokens({ access_token: accessToken, refresh_token: refreshToken });
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      });
      return;
    }

    if (code) {
      recoveryClient.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        setVerifying(false);
        if (error || !data.session) {
          setVerifyError(true);
        } else {
          setRecoveryTokens({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
      });
      return;
    }

    setVerifying(false);
    setVerifyError(true);
  }, [code, nativeUrl, recoveryClient]);

  async function handleSave() {
    if (password.length < 6) {
      showAlert("Too short", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showAlert("Mismatch", "Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await recoveryClient.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    setDone(true);
  }

  async function handleContinue() {
    // Only now hand the (now-repurposed) recovery session to the app's real
    // client, so the user lands logged in as themselves after finishing.
    if (recoveryTokens) {
      await supabase.auth.setSession(recoveryTokens);
    }
    router.replace("/");
  }

  if (verifying) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verifying link...</Text>
      </View>
    );
  }

  if (verifyError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Link expired or invalid</Text>
        <Text style={styles.subtitle}>Request a new password reset link and try again.</Text>
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Back to Forgot Password
        </Link>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.subtitle}>You can now use your new password.</Text>
        <Button title="Continue" onPress={handleContinue} style={{ marginTop: theme.spacing.sm }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <TextInput
        style={styles.input}
        placeholder="New Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <Button
        title={saving ? "Saving..." : "Save New Password"}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: theme.spacing.sm }}
      />
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
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.muted,
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
