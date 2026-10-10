import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView, StyleSheet  } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../src/lib/supabase";
import { showAlert } from "../../../../src/lib/alert";
import { useBusiness } from "../../../../src/hooks/useBusiness";
import { can, countGrantedActions, GranularPermissions } from "../../../../src/lib/permissions";
import { Button } from "../../../../src/components/button";
import { theme } from "../../../../src/lib/theme";

type Member = {
  id: string;
  role: string;
  permissions: GranularPermissions;
  user_id: string;
  full_name: string | null;
  email: string | null;
};
type Invitation = { id: string; email: string; role: string; status: string };

export default function Team() {
  const { business, memberId, permissions } = useBusiness();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const canEdit = can(permissions, "team", "edit");
  const canAdd = can(permissions, "team", "add");
  const canDelete = can(permissions, "team", "delete");

  const load = useCallback(async () => {
    if (!business) return;
    const { data: memberData, error: memberError } = await supabase.rpc("get_team_members", {
      p_business_id: business.id,
    });
    if (memberError) console.log("Error fetching team members:", memberError.message);
    setMembers((memberData as any) ?? []);

    const { data: inviteData, error: inviteError } = await supabase
      .from("business_invitations")
      .select("id, email, role, status")
      .eq("business_id", business.id)
      .eq("status", "pending")
      .order("created_at");
    if (inviteError) console.log("Error fetching invitations:", inviteError.message);
    setInvitations(inviteData ?? []);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("max_users")
      .eq("business_id", business.id)
      .maybeSingle();
    setMaxUsers(sub?.max_users ?? null);
  }, [business?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const seatsUsed = members.length + invitations.length;
  const ownerCount = members.filter((m) => m.role === "Owner").length;

  function handleRemove(member: Member) {
    const isOwner = member.role === "Owner";
    showAlert(
      isOwner ? "Remove this co-owner?" : "Remove team member?",
      isOwner
        ? `${member.full_name ?? "This co-owner"} will lose full access immediately, including everything they could see or manage as an owner.`
        : `${member.full_name ?? "This member"} will lose access immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isOwner ? "Remove Co-Owner" : "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("remove_team_member", {
              p_member_id: member.id,
            });
            if (error) showAlert("Error", error.message);
            else load();
          },
        },
      ],
    );
  }

  function handleCancelInvite(invite: Invitation) {
    showAlert("Cancel invitation?", `Withdraw the invite sent to ${invite.email}.`, [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Invite",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("business_invitations").delete().eq("id", invite.id);
          if (error) showAlert("Error", error.message);
          else load();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.seatsCard}>
        <Text style={styles.seatsText}>
          {seatsUsed} of {maxUsers ?? "—"} seats used
        </Text>
        <Text style={styles.seatsHint}>
          Need more seats? Contact EZBZ support to upgrade your plan.
        </Text>
      </View>

      {canAdd && (
        <Button
          title="+ Invite Team Member"
          onPress={() => router.push("/(app)/more/team/invite")}
          style={{ marginBottom: theme.spacing.lg }}
        />
      )}

      <Text style={styles.sectionTitle}>Team Members</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const grantedCount = countGrantedActions(item.permissions);
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                canEdit &&
                item.role !== "Owner" &&
                router.push(`/(app)/more/team/${item.id}`)
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name ?? "Unknown"}</Text>
                {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                <Text style={styles.detail}>
                  {item.role} · {grantedCount} permission{grantedCount === 1 ? "" : "s"}
                </Text>
              </View>
              {canDelete && item.id !== memberId && (item.role !== "Owner" || ownerCount > 1) && (
                <Pressable onPress={() => handleRemove(item)}>
                  <Text style={styles.removeText}>
                    {item.role === "Owner" ? "Remove Co-Owner" : "Remove"}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      {invitations.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Invitations</Text>
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.email}</Text>
                  <Text style={styles.detail}>{item.role} · Pending</Text>
                </View>
                {canDelete && (
                  <Pressable onPress={() => handleCancelInvite(item)}>
                    <Text style={styles.removeText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  seatsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  seatsText: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  seatsHint: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: theme.spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  name: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  email: { color: theme.colors.muted, fontSize: 12, marginTop: 1 },
  detail: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  removeText: { color: theme.colors.error, fontWeight: "600" },
});
