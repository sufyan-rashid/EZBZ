import { StyleSheet, Text, View } from "react-native";
import { PAYMENT_ACCOUNT } from "../lib/support";
import { formatCurrency } from "../lib/currency";
import { theme } from "../lib/theme";

// How to pay for a subscription, shown wherever a business renews.
export function PaymentInstructions({ monthlyAmount }: { monthlyAmount?: number | null }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>How to pay</Text>
      <Text style={styles.methods}>{PAYMENT_ACCOUNT.methods}</Text>
      <Text style={styles.number} selectable>
        {PAYMENT_ACCOUNT.number}
      </Text>
      <Text style={styles.accountTitle} selectable>
        Account title: {PAYMENT_ACCOUNT.title}
      </Text>
      {!!monthlyAmount && monthlyAmount > 0 && (
        <Text style={styles.amount}>Amount: {formatCurrency(monthlyAmount)} / month</Text>
      )}
      <View style={styles.steps}>
        <Text style={styles.step}>1. Send the payment to the number above.</Text>
        <Text style={styles.step}>2. Send us the transaction ID (TID) or a screenshot on WhatsApp.</Text>
        <Text style={styles.step}>3. Once we confirm, your subscription is renewed.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  title: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  methods: { color: theme.colors.muted, marginTop: theme.spacing.xs },
  number: { fontSize: 24, fontWeight: "800", color: theme.colors.text, letterSpacing: 0.5, marginTop: 2 },
  accountTitle: { color: theme.colors.text, fontWeight: "600" },
  amount: { color: theme.colors.text, marginTop: theme.spacing.xs },
  steps: { marginTop: theme.spacing.sm, gap: 2 },
  step: { color: theme.colors.muted, fontSize: 13 },
});
