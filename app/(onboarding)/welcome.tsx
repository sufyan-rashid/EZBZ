import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { showAlert } from "../../src/lib/alert";
import { useBusiness } from "../../src/hooks/useBusiness";
import { useAuth } from "../../src/hooks/useAuth";
import { getLandingRoute } from "../../src/lib/permissions";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

type Invitation = {
  invitation_id: string;
  business_id: string;
  business_name: string;
  role: string;
};

export default function Welcome() {
  const router = useRouter();
  const { session } = useAuth();
  const { refreshBusiness, switchBusiness } = useBusiness();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_my_pending_invitations");
    if (error) console.log("Error fetching invitations:", error.message);
    setInvitations(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleAccept(invite: Invitation) {
    setAcceptingId(invite.invitation_id);
    const { error } = await supabase.rpc("accept_pending_invitations", {
      p_invitation_id: invite.invitation_id,
    });
    setAcceptingId(null);
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    await refreshBusiness();
    await switchBusiness(invite.business_id);
    const { data: member, error: memberError } = await supabase
      .from("business_members")
      .select("permissions")
      .eq("business_id", invite.business_id)
      .eq("user_id", session?.user.id)
      .maybeSingle();
    if (memberError) console.log("Error fetching member permissions:", memberError.message);
    router.replace(getLandingRoute(member?.permissions as any) as any);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to EZBZ 👋</Text>
      <Text style={styles.subtitle}>
        Manage your business, products, orders and expenses in one place.
      </Text>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginBottom: theme.spacing.lg }} />
      ) : invitations.length > 0 ? (
        <View style={styles.invitesBox}>
          <Text style={styles.invitesTitle}>You have been invited to join:</Text>
          {invitations.map((inv) => (
            <View key={inv.invitation_id} style={styles.inviteRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteName}>{inv.business_name}</Text>
                <Text style={styles.inviteRole}>{inv.role}</Text>
              </View>
              <Button
                title={acceptingId === inv.invitation_id ? "Joining..." : "Accept"}
                size="sm"
                loading={acceptingId === inv.invitation_id}
                onPress={() => handleAccept(inv)}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Button
        title="+ Create New Business"
        onPress={() => router.push("/(onboarding)/business-info")}
      />
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
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.muted,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },
  invitesBox: {
    width: "100%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  invitesTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    marginBottom: theme.spacing.sm,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  inviteName: { color: theme.colors.text, fontWeight: "600" },
  inviteRole: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
});
