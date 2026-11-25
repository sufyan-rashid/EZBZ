import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Reuses the mobile app's root .env so the Supabase URL and anon key live in
// one place. The prefix exposes only those two values to the browser bundle.
export default defineConfig({
  plugins: [react()],
  envDir: "..",
  envPrefix: "EXPO_PUBLIC_SUPABASE_",
});
