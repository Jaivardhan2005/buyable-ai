import { PreferenceWeights } from "./ranking";
import { DemoProduct, DemoAttribute } from "./demo-catalog";

export type RankedResult = {
  product: DemoProduct;
  score: number;
};

function formatKey(key: string): string {
  return key.replace(/_/g, " ").toLowerCase();
}

export function generateExplanation(
  targetResult: RankedResult,
  index: number,
  allResults: RankedResult[],
  weights: PreferenceWeights,
  budgetPaise: bigint | null
): string {
  const activeWeights = Object.entries(weights)
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => b[1]! - a[1]!) as [DemoAttribute, number][];

  const target = targetResult.product;
  const targetPrice = target.pricePaise;

  // Case 1: No specific preferences provided
  if (activeWeights.length === 0) {
    // Find its strongest attribute
    const strongest = Object.entries(target.attributes).sort((a, b) => b[1] - a[1])[0];
    const attrName = formatKey(strongest[0]);
    if (index === 0) return `A well-rounded top choice that offers excellent ${attrName}.`;
    if (index === 1) return `A strong alternative featuring reliable ${attrName}.`;
    return `A solid option with good ${attrName}.`;
  }

  const topPrefKey = activeWeights[0][0];
  const topPrefName = formatKey(topPrefKey);
  const targetTopScore = target.attributes[topPrefKey] || 0;

  // Case 2: Rank 1 (Top Match)
  if (index === 0) {
    let budgetText = "";
    if (budgetPaise !== null) {
      const diff = Number(budgetPaise - targetPrice) / 100;
      if (diff > 500) {
        budgetText = ` while staying comfortably under your budget`;
      } else {
        budgetText = ` while fitting within your budget`;
      }
    }
    const secondaryPref = activeWeights.length > 1 ? ` and good ${formatKey(activeWeights[1][0])}` : "";
    return `Best overall match for your priorities. Delivers strong ${topPrefName}${secondaryPref}${budgetText}.`;
  }

  // Case 3: Lower Ranks (Trade-offs against Rank 1)
  const rank1 = allResults[0].product;
  const isCheaper = targetPrice < rank1.pricePaise;
  const targetTopPrefDiff = targetTopScore - (rank1.attributes[topPrefKey] || 0);

  if (isCheaper) {
    if (targetTopPrefDiff > 0) {
      return `A more affordable option that surprisingly delivers better ${topPrefName} than the top match.`;
    } else if (targetTopPrefDiff < -15) {
      return `A budget-friendly choice, trading some ${topPrefName} performance for a lower price.`;
    } else {
      return `A great value option that saves money while maintaining similar ${topPrefName} quality.`;
    }
  } else {
    // More expensive or same price as rank 1
    // Find an attribute where this product beats rank 1
    const betterAttr = activeWeights.find(([key]) => (target.attributes[key as DemoAttribute] || 0) > (rank1.attributes[key as DemoAttribute] || 0) + 5);
    if (betterAttr) {
      return `A premium alternative that offers superior ${formatKey(betterAttr[0])} compared to the top match.`;
    }
    
    // If it doesn't beat rank 1 on any requested preference, maybe it beats it on an unrequested one
    const betterUnrequestedAttr = Object.entries(target.attributes).find(([key, val]) => {
      return val > (rank1.attributes[key as DemoAttribute] || 0) + 15;
    });
    if (betterUnrequestedAttr) {
      return `A solid alternative that also provides excellent ${formatKey(betterUnrequestedAttr[0])}.`;
    }

    return `A reliable alternative choice with a different feature balance.`;
  }
}
