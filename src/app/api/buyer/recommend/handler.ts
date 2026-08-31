import { NextResponse } from "next/server";
import { generateExplanationDetails } from "@/lib/explanation";
import { rankProducts, PreferenceWeights, RankedProductResult } from "@/lib/ranking";
import { type Catalog } from "@/lib/catalog";
import { type DemoProduct } from "@/lib/demo-catalog";
import { type Prisma } from "../../../../../generated/prisma";

// BigInt JSON helper for Prisma JSON fields
function serializeBigInt(obj: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  ) as Prisma.InputJsonValue;
}

export async function handleRecommendation(
  request: Request,
  getSession: () => Promise<{ id: string } | null>,
  extractPrefs: (text: string) => Promise<{
    budgetPaise: bigint | null;
    category: string | null;
    weights: PreferenceWeights;
    useCases?: string[];
    requestedFeatures?: string[];
    pricePreference?: "budget" | "premium" | "value" | null;
  }>,
  getCatalog: () => Promise<Catalog>,
  saveRecommendation: (data: Prisma.RecommendationCreateArgs) => Promise<{ id: string }>
) {
  // 1. Validate session
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  // 2. Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const requestText = (body as Record<string, unknown>)?.requestText;
  if (typeof requestText !== "string" || requestText.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "requestText is required." } },
      { status: 400 }
    );
  }

  // 3. Extract structured preferences via LLM
  let extracted;
  try {
    extracted = await extractPrefs(requestText);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ExtractionError") {
      const message = "message" in error && typeof error.message === "string" ? error.message : "Extraction failed";
      return NextResponse.json(
        { error: { code: "EXTRACTION_FAILED", message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process request." } },
      { status: 500 }
    );
  }

  // 4. Load catalog and perform deterministic ranking
  const catalog = await getCatalog();
  if (!catalog.products || catalog.products.length === 0) {
    return NextResponse.json(
      { error: { code: "CATALOG_UNAVAILABLE", message: "No eligible products found in the catalog." } },
      { status: 503 }
    );
  }

  const rankedAll = rankProducts(
    catalog.products,
    extracted.weights,
    extracted.budgetPaise,
    extracted.category,
    {
      useCases: extracted.useCases,
      requestedFeatures: extracted.requestedFeatures,
      pricePreference: extracted.pricePreference,
    }
  );

  const topResults = rankedAll.slice(0, 3);
  const mappedResults = topResults.map((r: RankedProductResult, index: number) => {
    const details = generateExplanationDetails(
      r,
      index,
      topResults,
      extracted.weights,
      extracted.budgetPaise
    );
    return {
      sku: r.product.sku,
      name: r.product.name,
      brand: r.product.brand,
      category: r.product.category,
      subcategory: r.product.subcategory,
      description: r.product.description,
      score: r.score,
      scoreBreakdown: r.scoreBreakdown,
      pricePaise: r.product.pricePaise,
      rating: r.product.rating,
      reviewCount: r.product.reviewCount,
      specs: r.product.specs,
      features: r.product.features,
      attributes: r.product.attributes,
      explanation: details.explanation,
      strengths: details.strengths,
      tradeoffs: details.tradeoffs,
    };
  });

  // 5. Persist Recommendation snapshot
  let savedId = "rec-" + Date.now();
  try {
    const recommendation = await saveRecommendation({
      data: {
        sessionId: session.id,
        formulaVersion: "milestone-5-v1",
        requestSnapshot: serializeBigInt({
          text: requestText,
          interpreted: extracted,
        }),
        candidates: serializeBigInt(
          catalog.products.map((p: DemoProduct) => ({
            sku: p.sku,
            pricePaise: p.pricePaise,
            availableQty: p.availableQty,
          }))
        ),
        rankedResults: serializeBigInt(mappedResults),
      },
    });
    savedId = recommendation.id;
  } catch (err) {
    console.warn("Recommendation snapshot persistence note:", err);
  }

  // 6. Return recommendations
  return NextResponse.json(
    serializeBigInt({
      recommendationId: savedId,
      interpreted: extracted,
      results: mappedResults,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}
