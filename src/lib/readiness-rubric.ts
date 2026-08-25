export const readinessRubric = [
  { key: "catalogCompleteness", label: "Catalog completeness", weight: 30 },
  { key: "attributeQuality", label: "Product attribute quality", weight: 20 },
  { key: "inventoryFreshness", label: "Inventory freshness", weight: 15 },
  { key: "policyClarity", label: "Policy clarity", weight: 15 },
  { key: "checkoutReadiness", label: "Checkout readiness", weight: 10 },
  { key: "transactionSafety", label: "Transaction-safety controls", weight: 10 },
] as const;

export type ReadinessDimension = (typeof readinessRubric)[number]["key"];
export type ReadinessInput = Record<ReadinessDimension, number>;

export function calculateReadinessScore(input: ReadinessInput): number {
  return readinessRubric.reduce((total, dimension) => {
    const value = input[dimension.key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error(`${dimension.key} must be an integer from 0 to 100`);
    }
    return total + (value * dimension.weight) / 100;
  }, 0);
}
