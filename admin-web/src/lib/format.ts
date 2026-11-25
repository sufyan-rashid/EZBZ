export type Status = "active" | "trial" | "expired" | "cancelled" | "pending";

export const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  trial: "Trial",
  expired: "Expired",
  cancelled: "Cancelled",
  pending: "No subscription",
};

// Same rule as the server's business_subscription_active() and the app's
// src/lib/subscriptionStatus.ts.
export function effectiveStatus(status: string | null, expiry: string | null): Status {
  if (!status || status === "pending") return "pending";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (expiry && new Date(expiry).getTime() <= Date.now()) return "expired";
  return status === "active" ? "active" : "trial";
}

const moneyFormat = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });
export function money(n: number | null | undefined): string {
  return `Rs ${moneyFormat.format(Number(n ?? 0))}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const DAY = 86_400_000;
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

export function relDays(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = daysUntil(iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  if (d === -1) return "yesterday";
  return `${-d} days ago`;
}

// Mirrors Postgres "+ make_interval(months => n)": the day of month is
// clamped to the target month's last day (31 Jan + 1 month = 28/29 Feb).
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

// Pakistani numbers are usually typed as 03xx-xxxxxxx; wa.me needs 923xx...
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function isThisMonth(iso: string, offset = 0): boolean {
  const d = new Date(iso);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
}
