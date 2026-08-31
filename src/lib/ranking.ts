import type { DemoAttribute, DemoProduct } from "@/lib/demo-catalog";

export type PreferenceWeights = Partial<Record<DemoAttribute, number>>;

export type ScoreBreakdown = {
  attributeScore: number;
  useCaseScore: number;
  featureScore: number;
  qualityScore: number;
  valueScore: number;
  finalScore: number;
};

export type RankedProductResult = {
  product: DemoProduct;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
};

export type RankOptions = {
  budgetPaise?: bigint | null;
  category?: string | null;
  useCases?: string[];
  requestedFeatures?: string[];
  pricePreference?: "budget" | "premium" | "value" | null;
};

export function normalizeCategory(category?: string | null): string | null {
  if (!category) return null;
  const c = category.trim().toLowerCase();
  if (
    c.includes("earbud") ||
    c.includes("earphone") ||
    c.includes("tws") ||
    c.includes("in-ear") ||
    c.includes("airpod")
  ) {
    return "earbuds";
  }
  if (
    c.includes("headphone") ||
    c.includes("over-ear") ||
    c.includes("on-ear") ||
    c.includes("headset")
  ) {
    return "headphones";
  }
  if (
    c.includes("speaker") ||
    c.includes("soundbar") ||
    c.includes("boombox") ||
    c.includes("audio system")
  ) {
    return "speakers";
  }
  return c;
}

export function rankProducts(
  products: DemoProduct[],
  weights: PreferenceWeights,
  budgetPaise?: bigint | null,
  category?: string | null,
  options?: Omit<RankOptions, "budgetPaise" | "category">
): RankedProductResult[] {
  const activeWeights = Object.entries(weights).filter(
    ([, weight]) => Number.isFinite(weight) && (weight ?? 0) > 0
  ) as [DemoAttribute, number][];

  const totalWeight = activeWeights.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) {
    throw new Error("At least one positive preference weight is required");
  }

  const targetCategory = normalizeCategory(category);
  const requestedUseCases = options?.useCases?.map((u) => u.toLowerCase()) ?? [];
  const requestedFeatures = options?.requestedFeatures?.map((f) => f.toLowerCase()) ?? [];
  const pricePref = options?.pricePreference;

  return products
    .filter((product) => product.availableQty > 0)
    .filter((product) => budgetPaise == null || product.pricePaise <= budgetPaise)
    .filter((product) => {
      if (!targetCategory) return true;
      const prodCategory = normalizeCategory(product.category);
      return prodCategory === targetCategory;
    })
    .map((product) => {
      // 1. Weighted Attribute Score (0 - 100)
      const attributeScore =
        activeWeights.reduce(
          (sum, [key, weight]) => sum + (product.attributes[key] ?? 0) * weight,
          0
        ) / totalWeight;

      // 2. Use-Case Fit (0 - 100)
      let useCaseScore = 100;
      if (requestedUseCases.length > 0) {
        const prodUseCases = (product.useCases || []).map((u) => u.toLowerCase());
        const prodDesc = `${product.name} ${product.description} ${product.subcategory || ""}`.toLowerCase();
        let matches = 0;
        for (const req of requestedUseCases) {
          if (
            prodUseCases.some((u) => u.includes(req) || req.includes(u)) ||
            prodDesc.includes(req)
          ) {
            matches++;
          }
        }
        useCaseScore = (matches / requestedUseCases.length) * 100;
      }

      // 3. Feature Fit (0 - 100)
      let featureScore = 100;
      if (requestedFeatures.length > 0) {
        const prodFeatures = (product.features || []).map((f) => f.toLowerCase());
        const prodDesc = `${product.name} ${product.description} ${product.subcategory || ""}`.toLowerCase();
        let matches = 0;
        for (const req of requestedFeatures) {
          const isWater =
            (req.includes("water") || req.includes("sweat")) &&
            (product.attributes.WATER_RESISTANCE >= 75 ||
              prodFeatures.some((f) => f.includes("water") || f.includes("submersible") || f.includes("ipx")));
          const isAnc =
            (req.includes("anc") || req.includes("noise cancel")) &&
            (product.attributes.ANC_LEVEL >= 70 || Boolean(product.specs?.ancType));
          const isBattery =
            (req.includes("battery") || req.includes("playtime")) &&
            (product.attributes.BATTERY_HOURS >= 80 || (product.specs?.batteryHours ?? 0) >= 30);
          const isBass = req.includes("bass") && product.attributes.BASS >= 80;
          const isMic =
            (req.includes("mic") || req.includes("call")) && product.attributes.MICROPHONE >= 80;
          const isComfort =
            (req.includes("comfort") || req.includes("lightweight")) &&
            (product.attributes.COMFORT >= 85 || (product.specs?.weightGrams ?? 999) <= 200);

          if (
            isWater ||
            isAnc ||
            isBattery ||
            isBass ||
            isMic ||
            isComfort ||
            prodFeatures.some((f) => f.includes(req)) ||
            prodDesc.includes(req)
          ) {
            matches++;
          }
        }
        featureScore = (matches / requestedFeatures.length) * 100;
      }

      // 4. Quality Score (0 - 100)
      const qualityScore = ((product.rating ?? 4.5) / 5.0) * 100;

      // 5. Value Score (0 - 100)
      let valueScore = 50;
      const priceRupees = Number(product.pricePaise) / 100;
      if (pricePref === "budget") {
        // Lower prices get higher score
        valueScore = Math.max(10, Math.min(100, Math.round(100 - (priceRupees / 100))));
      } else if (pricePref === "premium") {
        valueScore = Math.max(10, Math.min(100, Math.round((priceRupees / 100))));
      }

      // 6. Final Composite Score
      let finalScore = attributeScore;
      if (requestedUseCases.length > 0 || requestedFeatures.length > 0 || pricePref) {
        if (pricePref === "budget") {
          finalScore = attributeScore * 0.40 + valueScore * 0.40 + qualityScore * 0.20;
        } else {
          const wAttr = 0.6;
          const wUse = requestedUseCases.length > 0 ? 0.2 : 0.0;
          const wFeat = requestedFeatures.length > 0 ? 0.15 : 0.0;
          const wQual = 1.0 - (wAttr + wUse + wFeat);
          finalScore =
            attributeScore * wAttr +
            useCaseScore * wUse +
            featureScore * wFeat +
            qualityScore * wQual;
        }
      }

      const roundedScore = Math.round(finalScore * 100) / 100;

      const scoreBreakdown: ScoreBreakdown = {
        attributeScore: Math.round(attributeScore * 10) / 10,
        useCaseScore: Math.round(useCaseScore * 10) / 10,
        featureScore: Math.round(featureScore * 10) / 10,
        qualityScore: Math.round(qualityScore * 10) / 10,
        valueScore: Math.round(valueScore * 10) / 10,
        finalScore: roundedScore,
      };

      return {
        product,
        score: roundedScore,
        scoreBreakdown,
      };
    })
    .sort((left, right) => {
      // 1. Higher score first
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      // 2. Lower price first (better value)
      if (left.product.pricePaise !== right.product.pricePaise) {
        return Number(left.product.pricePaise - right.product.pricePaise);
      }
      // 3. Higher available quantity first
      if (left.product.availableQty !== right.product.availableQty) {
        return right.product.availableQty - left.product.availableQty;
      }
      // 4. Alphabetical SKU
      return left.product.sku.localeCompare(right.product.sku);
    });
}
