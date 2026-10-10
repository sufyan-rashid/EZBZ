import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View, FlatList } from "react-native";
import { useAuth } from "../../src/hooks/useAuth";
import { useBusiness } from "../../src/hooks/useBusiness";
import { supabase } from "../../src/lib/supabase";
import { showAlert } from "../../src/lib/alert";
import { getLandingRoute } from "../../src/lib/permissions";
import { getEffectiveStatus } from "../../src/lib/subscriptionStatus";
import { Button } from "../../src/components/button";
import { theme } from "../../src/lib/theme";

type SubStatus = { expiry_date: string | null; status: string | null };
type Invitation = {
  invitation_id: string;
  business_id: string;
  business_name: string;
  role: string;
};

export default function SelectBusiness() {
  const router = useRouter();
  const { session } = useAuth();
  const { memberships, switchBusiness, refreshBusiness } = useBusiness();
  const [subStatus, setSubStatus] = useState<Record<string, SubStatus>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    const businessIds = memberships.map((m) => m.business.id);
    if (businessIds.length === 0) return;
    supabase
      .from("subscriptions")
      .select("business_id, expiry_date, status")
      .in("business_id", businessIds)
      .then(({ data, error }) => {
        if (error) console.log("Error fetching subscription status:", error.message);
        const map: Record<string, SubStatus> = {};
        (data ?? []).forEach((s) => {
          map[s.business_id] = { expiry_date: s.expiry_date, status: s.status };
        });
        setSubStatus(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships.length]);

  const loadInvitations = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_my_pending_invitations");
    if (error) console.log("Error fetching invitations:", error.message);
    setInvitations(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInvitations();
    }, [loadInvitations]),
  );

  async function handleAcceptInvitation(invite: Invitation) {
    setAcceptingId(invite.invitation_id);
    const { error } = await supabase.rpc("accept_pending_invitations", {
      p_invitation_id: invite.invitation_id,
    });
    if (error) {
      setAcceptingId(null);
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
    setAcceptingId(null);
    router.replace(getLandingRoute(member?.permissions as any) as any);
  }

  async function handleSelect(membership: (typeof memberships)[number]) {
    await switchBusiness(membership.business.id);
    router.replace(getLandingRoute(membership.permissions) as any);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{memberships.length > 1 ? "Choose a Business" : "My Businesses"}</Text>
      <Text style={styles.subtitle}>
        {memberships.length > 1
          ? "This account is linked to more than one business."
          : "Switch businesses or accept a new invitation below."}
      </Text>

      {invitations.length > 0 && (
        <View style={styles.invitesBox}>
          <Text style={styles.invitesTitle}>You have been invited to join:</Text>
          {invitations.map((inv) => (
            <View key={inv.invitation_id} style={styles.inviteRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{inv.business_name}</Text>
                <Text style={styles.rowRole}>{inv.role}</Text>
              </View>
              <Button
                title="Accept"
                size="sm"
                loading={acceptingId === inv.invitation_id}
                onPress={() => handleAcceptInvitation(inv)}
              />
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={memberships}
        keyExtractor={(item) => item.memberId}
        contentContainerStyle={{ width: "100%" }}
        renderItem={({ item }) => {
          const sub = subStatus[item.business.id];
          const effective = sub ? getEffectiveStatus(sub.status, sub.expiry_date) : null;
          const isHealthy = effective === "active" || effective === "trial";
          return (
            <Pressable style={styles.row} onPress={() => handleSelect(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.business.name}</Text>
                <Text style={styles.rowRole}>{item.role}</Text>
              </View>
              {effective && (
                <View style={[styles.badge, isHealthy ? styles.badgeActive : styles.badgeExpired]}>
                  <Text style={styles.badgeText}>
                    {effective === "cancelled" ? "Cancelled" : isHealthy ? "Active" : "Expired"}
                  </Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />

      <Button
        title="+ Create New Business"
        variant="outline"
        onPress={() => router.push("/(onboarding)/business-info")}
        style={{ marginTop: theme.spacing.md }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xs,
    textAlign: "center",
  },
  subtitle: {
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
    marginBottom: theme.spacing.lg,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  rowName: { color: theme.colors.text, fontWeight: "600", fontSize: 16 },
  rowRole: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  badge: {
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    marginRight: theme.spacing.sm,
  },
  badgeActive: { backgroundColor: theme.colors.success },
  badgeExpired: { backgroundColor: theme.colors.error },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  chevron: { color: theme.colors.muted, fontSize: 20 },
});
