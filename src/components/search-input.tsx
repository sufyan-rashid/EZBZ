import { useEffect, useRef, useState } from "react";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { theme } from "../lib/theme";

// Typing updates the field instantly (localValue), but the caller's
// onChangeText — which usually triggers a server query — only fires after a
// short pause, so fast typing doesn't send a request per keystroke.
const DEBOUNCE_MS = 300;

export function SearchInput({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  style?: object;
}) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(text: string) {
    setLocalValue(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChangeText(text), DEBOUNCE_MS);
  }

  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalValue("");
    onChangeText("");
  }

  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={localValue}
        onChangeText={handleChange}
      />
      {localValue.length > 0 && (
        <Pressable style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, position: "relative", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    paddingRight: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
  },
  clearButton: {
    position: "absolute",
    right: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  clearText: { color: theme.colors.muted, fontSize: 14, fontWeight: "700" },
});
