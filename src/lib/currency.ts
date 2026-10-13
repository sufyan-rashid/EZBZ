// Rounds a money amount to the nearest paisa (cent), as an integer count of
// paisas, so two amounts that are equal "to the rupee" never fail a strict
// comparison because of JS float noise (e.g. 100.10 - 50.05 !== 50.05).
function toPaisas(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

// True when `amount` is more than `limit`, ignoring sub-paisa float noise —
// use this instead of `amount > limit` whenever either side was computed by
// adding/subtracting/dividing money values before the comparison.
export function exceedsAmount(amount: number, limit: number): boolean {
  return toPaisas(amount) > toPaisas(limit);
}

// Same idea for "amount is less than limit" checks (e.g. a required
// full-payment threshold).
export function isLessThanAmount(amount: number, limit: number): boolean {
  return toPaisas(amount) < toPaisas(limit);
}

// "Rs. 8,500" style formatting — PKR, no decimals for whole amounts, comma
// thousand-separators so big numbers stay readable at a glance on the till.
export function formatCurrency(amount: number): string {
  const num = Number(amount) || 0;
  const hasFraction = Math.abs(num % 1) > 0.001;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `Rs. ${formatted}`;
}
