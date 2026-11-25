import { useEffect, useState } from "react";
import { View, Text, TextInput, Image, ScrollView, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { openSupportWhatsApp } from "../../../../src/lib/support";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { useSubscription } from "../../../../src/hooks/useSubscription";
import { can } from "../../../../src/lib/permissions";
import { formatCurrency } from "../../../../src/lib/currency";
import { Button } from "../../../../src/components/button";
import { PaymentInstructions } from "../../../../src/components/payment-instructions";
import { theme } from "../../../../src/lib/theme";

export default function BusinessSettings() {
  const { business, refreshBusiness, permissions } = useBusiness();
  const { subscription, effectiveStatus } = useSubscription();

  const [bizName, setBizName] = useState("");
  const [bizCategory, setBizCategory] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [savingBiz, setSavingBiz] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (business) {
      setBizName(business.name);
      setBizCategory(business.category ?? "");
      setBizPhone(business.phone ?? "");
      setBizAddress(business.address ?? "");
    }
  }, [business]);

  async function handleSaveBusiness() {
    if (!bizName.trim()) return showAlert("Missing info", "Business name is required.");
    if (!business) return;
    setSavingBiz(true);
    const { data, error } = await supabase
      .from("businesses")
      .update({
        name: bizName.trim(),
        category: bizCategory.trim() || null,
        phone: bizPhone.trim() || null,
        address: bizAddress.trim() || null,
      })
      .eq("id", business.id)
      .select("id");
    setSavingBiz(false);
    if (error) showAlert("Error", error.message);
    else if (!data?.length) {
      showAlert("Not saved", "Business info can't be changed right now — check the subscription is active and that you have Business Settings access.");
    } else {
      showAlert("Saved", "Business info updated.");
      refreshBusiness();
    }
  }

  async function handleUploadLogo() {
    if (!business) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("Permission needed", "Allow photo library access to pick a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingLogo(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop()?.split("?")[0] || "jpg";
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const path = `${business.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("business-logos")
        .upload(path, blob, { contentType: asset.mimeType || `image/${ext}`, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("business-logos").getPublicUrl(path);
      const logoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { data: updated, error: updateError } = await supabase
        .from("businesses")
        .update({ logo_url: logoUrl })
        .eq("id", business.id)
        .select("id");
      if (updateError) throw updateError;
      if (!updated?.length) {
        throw new Error("The logo couldn't be saved — check the subscription is active and that you have Business Settings access.");
      }

      await refreshBusiness();
      showAlert("Saved", "Business logo updated.");
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not upload logo.");
    }
    setUploadingLogo(false);
  }

  function handleRenew() {
    openSupportWhatsApp(
      `Hi, I've sent the EZBZ subscription payment for "${business?.name ?? "my business"}". TID: `,
    );
  }

  if (!can(permissions, "settings", "view")) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.muted }}>
          You don&apos;t have permission to view business settings.
        </Text>
      </View>
    );
  }

  const canEditSettings = can(permissions, "settings", "edit");
  const subscriptionPrice =
    subscription && subscription.amount > 0 ? `${formatCurrency(subscription.amount)}/month` : "Free (Trial)";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Business Info</Text>
      <View style={styles.card}>
        <View style={styles.logoRow}>
          {business?.logo_url ? (
            <Image source={{ uri: business.logo_url }} style={styles.logoPreview} />
          ) : (
            <View style={[styles.logoPreview, styles.logoPlaceholder]}>
              <Text style={styles.logoPlaceholderText}>No Logo</Text>
            </View>
          )}
          {canEditSettings && (
            <Button
              title={uploadingLogo ? "Uploading..." : business?.logo_url ? "Change Logo" : "Upload Logo"}
              variant="outline"
              size="sm"
              loading={uploadingLogo}
              onPress={handleUploadLogo}
            />
          )}
        </View>
        <TextInput style={styles.input} placeholder="Business Name" value={bizName} onChangeText={setBizName} editable={canEditSettings} />
        <TextInput style={styles.input} placeholder="Category" value={bizCategory} onChangeText={setBizCategory} editable={canEditSettings} />
        <TextInput style={styles.input} placeholder="Phone" value={bizPhone} onChangeText={setBizPhone} editable={canEditSettings} />
        <TextInput style={styles.input} placeholder="Address" value={bizAddress} onChangeText={setBizAddress} editable={canEditSettings} />
        {canEditSettings && (
          <Button
            title={savingBiz ? "Saving..." : "Save Business Info"}
            onPress={handleSaveBusiness}
            loading={savingBiz}
          />
        )}
      </View>

      <Text style={styles.sectionTitle}>Subscription</Text>
      <View style={styles.card}>
        <Row label="Plan" value="Monthly" />
        <Row label="Price" value={subscriptionPrice} />
        <Row label="Status" value={effectiveStatus} />
        <Row
          label="Expiry"
          value={subscription?.expiry_date ? new Date(subscription.expiry_date).toLocaleDateString() : "Not activated"}
        />
        <Button title="Send Payment Proof on WhatsApp" onPress={handleRenew} style={{ marginTop: theme.spacing.md }} />
      </View>
      <View style={{ marginTop: theme.spacing.md }}>
        <PaymentInstructions monthlyAmount={subscription?.amount} />
      </View>

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <Row label="Currency" value="PKR" />
        <Row label="Date Format" value="Locale default" />
        <Row label="Low Stock Alerts" value="Shown on Dashboard" />
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: theme.spacing.xs },
  rowLabel: { color: theme.colors.muted },
  rowValue: { color: theme.colors.text, fontWeight: "600", textTransform: "capitalize" },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.md },
  logoPreview: { width: 56, height: 56, borderRadius: theme.radius.md, marginRight: theme.spacing.md, backgroundColor: theme.colors.background },
  logoPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  logoPlaceholderText: { color: theme.colors.muted, fontSize: 10 },
});
