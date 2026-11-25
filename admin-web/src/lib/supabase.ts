import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in the repo's root .env");
}

export const supabase = createClient(url, anonKey);
