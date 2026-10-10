import { View, Text, Pressable, StyleSheet } from "react-native";
import { theme } from "../lib/theme";

type Option<T extends string> = { label: string; value: T };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: theme.spacing.sm },
  pill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  pillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pillText: { color: theme.colors.text, fontWeight: "600", fontSize: 13 },
  pillTextActive: { color: "#fff" },
});
