import type { DemoAttribute, DemoProduct } from "@/lib/demo-catalog";

export type PreferenceWeights = Partial<Record<DemoAttribute, number>>;

export function rankProducts(products: DemoProduct[], weights: PreferenceWeights, budgetPaise: bigint) {
  const activeWeights = Object.entries(weights).filter(([, weight]) => Number.isFinite(weight) && (weight ?? 0) > 0) as [DemoAttribute, number][];
  const totalWeight = activeWeights.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) throw new Error("At least one positive preference weight is required");

  return products
    .filter((product) => product.availableQty > 0 && product.pricePaise <= budgetPaise)
    .map((product) => ({ product, score: activeWeights.reduce((sum, [key, weight]) => sum + product.attributes[key] * weight, 0) / totalWeight }))
    .sort((left, right) => right.score - left.score || Number(left.product.pricePaise - right.product.pricePaise) || right.product.availableQty - left.product.availableQty || left.product.sku.localeCompare(right.product.sku));
}
