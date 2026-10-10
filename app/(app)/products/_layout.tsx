import { Stack } from "expo-router";

export default function ProductsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Products" }} />
      <Stack.Screen name="new" options={{ title: "Add Product" }} />
      <Stack.Screen name="[id]" options={{ title: "Edit Product" }} />
      <Stack.Screen name="categories" options={{ title: "Categories" }} />
      <Stack.Screen name="import" options={{ title: "Import Products" }} />
    </Stack>
  );
}
