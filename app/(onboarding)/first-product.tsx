import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

export default function FirstProduct() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add your first product</Text>
      <Text style={styles.subtitle}>
        You can always do this later from the Products tab.
      </Text>
      <Button
        title="Add Product"
        onPress={() => router.push("/(app)/products/new")}
        style={{ marginBottom: theme.spacing.md }}
      />
      <Pressable
        style={styles.skipButton}
        onPress={() => router.replace("/(app)/dashboard")}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.muted,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },
  skipButton: { padding: theme.spacing.sm },
  skipText: { color: theme.colors.secondary, fontWeight: "600" },
});
