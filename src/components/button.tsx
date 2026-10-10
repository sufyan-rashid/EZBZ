import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text, TextStyle, ViewStyle } from "react-native";
import { theme } from "../lib/theme";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "md" | "sm";

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  style,
  textStyle,
  ...rest
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
} & Omit<PressableProps, "style" | "onPress" | "disabled">) {
  const isFilled = variant === "primary" || variant === "secondary" || variant === "danger";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sizeSm : styles.sizeMd,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isFilled ? "#fff" : theme.colors.primary} />
      ) : (
        <Text
          style={[
            styles.text,
            size === "sm" && styles.textSm,
            textVariantStyles[variant],
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  sizeMd: { minHeight: 50, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  sizeSm: { minHeight: 44, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { fontSize: 16, fontWeight: "700" },
  textSm: { fontSize: 14 },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.secondary },
  danger: { backgroundColor: theme.colors.error },
  outline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: theme.colors.primary },
  ghost: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
};

const textVariantStyles: Record<Variant, TextStyle> = {
  primary: { color: "#fff" },
  secondary: { color: "#fff" },
  danger: { color: "#fff" },
  outline: { color: theme.colors.primary },
  ghost: { color: theme.colors.text },
};
