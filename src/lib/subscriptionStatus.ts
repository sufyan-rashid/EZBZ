export type EffectiveSubscriptionStatus = "pending" | "trial" | "active" | "expired" | "cancelled";

export function getEffectiveStatus(
  rawStatus: string | null | undefined,
  expiryDate: string | null | undefined,
): EffectiveSubscriptionStatus {
  if (!rawStatus) return "pending";
  if (rawStatus === "cancelled") return "cancelled";
  if (expiryDate && new Date(expiryDate).getTime() <= Date.now()) return "expired";
  return rawStatus === "active" ? "active" : "trial";
}
