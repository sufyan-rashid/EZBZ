import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { theme } from "../lib/theme";

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};
type AlertState = { title: string; message?: string; buttons: AlertButton[] } | null;

let listener: ((state: AlertState) => void) | null = null;

export function showWebAlert(title: string, message: string | undefined, buttons: AlertButton[]) {
  listener?.({ title, message, buttons });
}

export function AlertHost() {
  const [state, setState] = useState<AlertState>(null);

  useEffect(() => {
    listener = setState;
    return () => {
      listener = null;
    };
  }, []);

  if (!state) return null;

  function handlePress(button: AlertButton) {
    setState(null);
    button.onPress?.();
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setState(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.buttonColumn}>
            {state.buttons.map((button, i) => (
              <Pressable
                key={i}
                style={[styles.button, i > 0 && styles.buttonSpacing]}
                onPress={() => handlePress(button)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === "destructive" && styles.destructiveText,
                    button.style === "cancel" && styles.cancelText,
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    width: "100%",
    maxWidth: 340,
  },
  title: { fontSize: 17, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.xs },
  message: { color: theme.colors.muted, marginBottom: theme.spacing.md },
  buttonColumn: { marginTop: theme.spacing.sm },
  button: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
  },
  buttonSpacing: { marginTop: theme.spacing.sm },
  buttonText: { color: theme.colors.primary, fontWeight: "600" },
  destructiveText: { color: theme.colors.error },
  cancelText: { color: theme.colors.muted },
});
