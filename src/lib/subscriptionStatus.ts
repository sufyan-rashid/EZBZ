export type EffectiveSubscriptionStatus = "pending" | "trial" | "active" | "expired" | "cancelled";

// Must agree with business_subscription_active() on the server, which only
// accepts 'active'/'trial' rows whose expiry hasn't passed.
export function getEffectiveStatus(
  rawStatus: string | null | undefined,
  expiryDate: string | null | undefined,
): EffectiveSubscriptionStatus {
  if (!rawStatus || rawStatus === "pending") return "pending";
  if (rawStatus === "cancelled") return "cancelled";
  if (rawStatus === "expired") return "expired";
  if (expiryDate && new Date(expiryDate).getTime() <= Date.now()) return "expired";
  return rawStatus === "active" ? "active" : "trial";
}
