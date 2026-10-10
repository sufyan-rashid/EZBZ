import { Stack } from "expo-router";

export default function OrdersLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Orders" }} />
      <Stack.Screen name="new" options={{ title: "New Order" }} />
      <Stack.Screen name="[id]" options={{ title: "Order" }} />
    </Stack>
  );
}
