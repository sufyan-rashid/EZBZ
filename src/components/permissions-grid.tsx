import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  FEATURE_ACTIONS,
  FEATURE_LABELS,
  GranularPermissions,
  PermissionAction,
} from "../lib/permissions";
import { theme } from "../lib/theme";

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "View" },
  { key: "add", label: "Add" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Del" },
];

type Props = {
  permissions: GranularPermissions;
  onChange: (permissions: GranularPermissions) => void;
};

export function PermissionsGrid({ permissions, onChange }: Props) {
  function toggle(feature: string, action: PermissionAction) {
    const current = !!permissions[feature]?.[action];
    onChange({
      ...permissions,
      [feature]: { ...permissions[feature], [action]: !current },
    });
  }

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.featureCell} />
        {ACTIONS.map((a) => (
          <Text key={a.key} style={styles.headerCell}>
            {a.label}
          </Text>
        ))}
      </View>
      {Object.keys(FEATURE_ACTIONS).map((feature) => (
        <View key={feature} style={styles.row}>
          <Text style={styles.featureCell}>{FEATURE_LABELS[feature]}</Text>
          {ACTIONS.map((a) => {
            if (!FEATURE_ACTIONS[feature].includes(a.key)) {
              return <View key={a.key} style={styles.checkboxCell} />;
            }
            const checked = !!permissions[feature]?.[a.key];
            return (
              <Pressable
                key={a.key}
                style={styles.checkboxCell}
                onPress={() => toggle(feature, a.key)}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.tick}>✓</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  featureCell: { flex: 1, color: theme.colors.text, fontWeight: "600" },
  headerCell: {
    width: 44,
    textAlign: "center",
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  checkboxCell: { width: 44, alignItems: "center" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tick: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
