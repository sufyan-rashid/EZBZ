import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const DEVICE_ID_KEY = "ezbz_device_id";

let cachedDeviceId: string | null = null;
let deviceIdPromise: Promise<string> | null = null;
let lastClaimedAt = 0;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (deviceIdPromise) return deviceIdPromise;

  deviceIdPromise = (async () => {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
    return id;
  })();

  return deviceIdPromise;
}

export async function claimDeviceSession(userId: string) {
  const deviceId = await getDeviceId();
  await supabase.from("active_sessions").upsert({
    user_id: userId,
    session_id: deviceId,
    updated_at: new Date().toISOString(),
  });
  lastClaimedAt = Date.now();
}

export function justClaimedRecently(): boolean {
  return Date.now() - lastClaimedAt < 5000;
}

export async function isDeviceSessionValid(userId: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  const { data } = await supabase
    .from("active_sessions")
    .select("session_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true;
  return data.session_id === deviceId;
}
