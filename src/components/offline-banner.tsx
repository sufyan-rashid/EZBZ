import { View, Text, StyleSheet } from "react-native";
import { useNetwork } from "../hooks/useNetwork";
import { theme } from "../lib/theme";

export function OfflineBanner() {
  const { isConnected } = useNetwork();
  if (isConnected) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet connection — changes will not save until you are back online.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.error,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  text: { color: "#fff", fontSize: 12, textAlign: "center", fontWeight: "600" },
});
