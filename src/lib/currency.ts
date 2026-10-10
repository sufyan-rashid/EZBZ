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
