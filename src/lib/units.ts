export type UnitType = "each" | "weight" | "pack";

export const WEIGHT_UNIT_OPTIONS = ["kg", "g", "liter", "ml"] as const;

export type ProductUnitInfo = {
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};

function trimZeros(n: number): string {
  return Number(n.toFixed(3)).toString();
}

// How much of a product one "unit" button-press represents, for the Orders/
// Returns cart UI: each product is sold whole, by its weight/volume unit, or
// by a configurable pack (e.g. a strip of 12 tablets) plus loose singles.
export function defaultStepQuantity(info: ProductUnitInfo): number {
  if (info.unit_type === "weight") return 1;
  return 1;
}

// Splits a quantity (always stored in the product's smallest/base unit) into
// whole packs + leftover loose units, for pack-type products.
export function splitPacks(quantity: number, packSize: number): { packs: number; loose: number } {
  const packs = Math.floor(quantity / packSize + 1e-9);
  const loose = Math.round((quantity - packs * packSize) * 1000) / 1000;
  return { packs, loose };
}

// Human-readable quantity, e.g. "2.5 kg", "1 pack + 3 tablets", "4".
export function formatQuantity(quantity: number, info: ProductUnitInfo): string {
  if (info.unit_type === "weight") {
    return `${trimZeros(quantity)}${info.unit ? " " + info.unit : ""}`;
  }
  if (info.unit_type === "pack" && info.pack_size) {
    const { packs, loose } = splitPacks(quantity, info.pack_size);
    const unitLabel = info.unit || "unit";
    const parts: string[] = [];
    if (packs > 0) parts.push(`${packs} pack${packs === 1 ? "" : "s"}`);
    if (loose > 0 || packs === 0) parts.push(`${trimZeros(loose)} ${unitLabel}${loose === 1 ? "" : "s"}`);
    return parts.join(" + ");
  }
  return trimZeros(quantity);
}

// The blended per-base-unit price for a pack-type cart line, so the existing
// `unit_price_override` the order/return RPCs already accept can carry a
// single rate even though packs and loose units are priced differently.
export function effectiveUnitPrice(
  quantity: number,
  subtotal: number,
  fallback: number,
): number {
  if (quantity <= 0) return fallback;
  // Rounded to tame floating-point noise from the division (e.g. a Rs. 100
  // pack of 12 divides to a repeating decimal) before it round-trips through
  // the server, which multiplies this back out by quantity.
  return Math.round((subtotal / quantity) * 1e6) / 1e6;
}

export function packSubtotal(packs: number, loose: number, info: ProductUnitInfo, loosePrice: number): number {
  const packPrice = info.pack_price ?? 0;
  return packs * packPrice + loose * loosePrice;
}
