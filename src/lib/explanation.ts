import { PreferenceWeights, RankedProductResult } from "./ranking";
import { DemoProduct, DemoAttribute } from "./demo-catalog";

export type RankedResult = RankedProductResult;

export type ExplanationDetails = {
  explanation: string;
  strengths: string[];
  tradeoffs: string[];
};

function formatKey(key: string): string {
  return key.replace(/_/g, " ").toLowerCase();
}

export function extractStrengths(product: DemoProduct, weights: PreferenceWeights = {}): string[] {
  const strengths: string[] = [];

  // Prioritize requested attribute strengths
  const requestedKeys = Object.entries(weights)
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => k as DemoAttribute);

  for (const key of requestedKeys) {
    const score = product.attributes[key] ?? 0;
    if (score >= 75 && strengths.length < 3) {
      if (key === "BASS") strengths.push(`Deep Bass (${score}/100)`);
      else if (key === "ANC_LEVEL") strengths.push(`Advanced ANC (${score}/100)`);
      else if (key === "BATTERY_HOURS") {
        const hrs = product.specs?.batteryHours ? `${product.specs.batteryHours}h Battery` : `Long Battery (${score}/100)`;
        strengths.push(hrs);
      } else if (key === "MICROPHONE") strengths.push(`Clear Mic (${score}/100)`);
      else if (key === "COMFORT") strengths.push(`High Comfort (${score}/100)`);
      else if (key === "WATER_RESISTANCE") {
        const rating = product.specs?.waterRating || "Waterproof";
        strengths.push(`${rating} Protection`);
      }
    }
  }

  // Top rated attributes
  const sortedAttrs = Object.entries(product.attributes)
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score >= 75);

  for (const [key, score] of sortedAttrs) {
    if (strengths.length >= 3) break;
    if (key === "BASS" && score >= 90 && !strengths.some((s) => s.includes("Bass"))) strengths.push(`Deep Bass (${score}/100)`);
    else if (key === "ANC_LEVEL" && score >= 85 && !strengths.some((s) => s.includes("ANC"))) strengths.push(`Advanced ANC (${score}/100)`);
    else if (key === "BATTERY_HOURS" && score >= 85 && !strengths.some((s) => s.includes("Battery"))) {
      const hrs = product.specs?.batteryHours ? `${product.specs.batteryHours}h Battery` : `Long Battery (${score}/100)`;
      strengths.push(hrs);
    } else if (key === "MICROPHONE" && score >= 85 && !strengths.some((s) => s.includes("Mic"))) strengths.push(`Clear Mic (${score}/100)`);
    else if (key === "COMFORT" && score >= 85 && !strengths.some((s) => s.includes("Comfort"))) strengths.push(`High Comfort (${score}/100)`);
    else if (key === "WATER_RESISTANCE" && score >= 85 && !strengths.some((s) => s.includes("Protection"))) {
      const rating = product.specs?.waterRating || "Waterproof";
      strengths.push(`${rating} Protection`);
    }
  }

  if (strengths.length < 3 && product.specs?.waterRating && !strengths.some((s) => s.includes("Protection"))) {
    strengths.push(`${product.specs.waterRating} Rating`);
  }
  if (strengths.length < 3 && product.features && product.features.length > 0) {
    strengths.push(product.features[0]);
  }
  if (strengths.length < 3 && product.rating && product.rating >= 4.5) {
    strengths.push(`★ ${product.rating} Rating`);
  }

  return strengths.slice(0, 3);
}

export function extractTradeoffs(
  target: DemoProduct,
  index: number,
  allResults: RankedResult[],
  weights: PreferenceWeights = {}
): string[] {
  const tradeoffs: string[] = [];
  const rank1 = allResults[0]?.product;

  if (index > 0 && rank1) {
    const requestedKeys = Object.entries(weights)
      .filter(([, w]) => (w ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k]) => k as DemoAttribute);

    for (const key of requestedKeys) {
      const diff = (rank1.attributes[key] || 0) - (target.attributes[key] || 0);
      if (diff >= 10 && tradeoffs.length < 2) {
        tradeoffs.push(`Lower ${formatKey(key)} than #1 (${target.attributes[key]} vs ${rank1.attributes[key]})`);
      }
    }
  }

  if (tradeoffs.length < 2) {
    if (target.category !== "speakers" && target.attributes.ANC_LEVEL < 30) {
      tradeoffs.push("Passive noise isolation only (No ANC)");
    } else if (target.category !== "speakers" && target.attributes.BATTERY_HOURS < 65) {
      tradeoffs.push("Standard battery reserve");
    } else if (target.category === "speakers" && target.specs?.weightGrams && target.specs.weightGrams >= 800) {
      tradeoffs.push(`Heavier build (${target.specs.weightGrams}g)`);
    } else if (target.attributes.WATER_RESISTANCE < 45 && target.category !== "headphones") {
      tradeoffs.push("Limited splash resistance");
    }
  }

  return tradeoffs.slice(0, 2);
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
  const rank1 = allResults[0]?.product;
  if (!rank1) {
    return `A solid option with good ${topPrefName}.`;
  }

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
    const betterAttr = activeWeights.find(
      ([key]) => (target.attributes[key as DemoAttribute] || 0) > (rank1.attributes[key as DemoAttribute] || 0) + 5
    );
    if (betterAttr) {
      return `A premium alternative that offers superior ${formatKey(betterAttr[0])} compared to the top match.`;
    }

    const betterUnrequestedAttr = Object.entries(target.attributes).find(([key, val]) => {
      return val > (rank1.attributes[key as DemoAttribute] || 0) + 15;
    });
    if (betterUnrequestedAttr) {
      return `A solid alternative that also provides excellent ${formatKey(betterUnrequestedAttr[0])}.`;
    }

    return `A reliable alternative choice with a different feature balance.`;
  }
}

export function generateExplanationDetails(
  targetResult: RankedResult,
  index: number,
  allResults: RankedResult[],
  weights: PreferenceWeights,
  budgetPaise: bigint | null
): ExplanationDetails {
  return {
    explanation: generateExplanation(targetResult, index, allResults, weights, budgetPaise),
    strengths: extractStrengths(targetResult.product, weights),
    tradeoffs: extractTradeoffs(targetResult.product, index, allResults, weights),
  };
}
