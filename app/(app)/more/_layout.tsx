import { Stack } from "expo-router";

export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "More", headerShown: false }} />
      <Stack.Screen name="inventory/index" options={{ title: "Inventory" }} />
      <Stack.Screen name="inventory/[productId]" options={{ title: "Adjust Stock" }} />
      <Stack.Screen name="expenses/index" options={{ title: "Expenses" }} />
      <Stack.Screen name="expenses/new" options={{ title: "Add Expense" }} />
      <Stack.Screen name="expenses/[id]" options={{ title: "Edit Expense" }} />
      <Stack.Screen name="reports/index" options={{ title: "Reports" }} />
      <Stack.Screen name="returns/index" options={{ title: "Returns" }} />
      <Stack.Screen name="returns/new" options={{ title: "New Return" }} />
      <Stack.Screen name="returns/[id]" options={{ title: "Return" }} />
      <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
      <Stack.Screen name="team/index" options={{ title: "Team" }} />
      <Stack.Screen name="team/invite" options={{ title: "Invite Team Member" }} />
      <Stack.Screen name="team/[id]" options={{ title: "Edit Permissions" }} />
      <Stack.Screen name="admin/index" options={{ title: "Admin" }} />
      <Stack.Screen name="pending-sync" options={{ title: "Pending Sync" }} />
    </Stack>
  );
}
