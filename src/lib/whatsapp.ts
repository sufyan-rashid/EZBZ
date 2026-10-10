import { Linking } from "react-native";

export function normalizePakistaniPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0092")) return digits.slice(2);
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

export function openWhatsApp(phone: string, message: string) {
  const normalized = normalizePakistaniPhone(phone);
  if (!normalized) return false;
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url);
  return true;
}
