import { NextResponse } from "next/server";
import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { extractPreferences, ExtractionError } from "@/lib/llm.server";
import { getPublishedCatalog } from "@/lib/catalog.server";
import { rankProducts } from "@/lib/ranking";
import { prisma } from "@/lib/prisma";

// BigInt JSON helper for Prisma JSON fields
function serializeBigInt(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === "bigint" ? value.toString() : value
  ));
}

export async function handleRecommendation(
  request: Request,
  getSession: () => Promise<{ id: string } | null>,
  extractPrefs: (text: string) => Promise<{ budgetPaise: bigint | null, category: string | null, weights: Record<string, number> }>,
  getCatalog: () => Promise<any>,
  saveRecommendation: (data: any) => Promise<{ id: string }>
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
  } catch (error: any) {
    if (error && error.name === "ExtractionError") {
      return NextResponse.json(
        { error: { code: "EXTRACTION_FAILED", message: error.message } },
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

  const rankedAll = rankProducts(catalog.products, extracted.weights, extracted.budgetPaise, extracted.category);
  const topResults = rankedAll.slice(0, 3);
  const mappedResults = topResults.map((r: any) => ({
    sku: r.product.sku,
    name: r.product.name,
    brand: r.product.brand,
    description: r.product.description,
    score: r.score,
    pricePaise: r.product.pricePaise,
    attributes: r.product.attributes
  }));

  // 5. Persist Recommendation snapshot
  const recommendation = await saveRecommendation({
    data: {
      sessionId: session.id,
      formulaVersion: "day-3-v1",
      requestSnapshot: serializeBigInt({
        text: requestText,
        interpreted: extracted,
      }),
      candidates: serializeBigInt(
        catalog.products.map((p: any) => ({ sku: p.sku, pricePaise: p.pricePaise, availableQty: p.availableQty }))
      ),
      rankedResults: serializeBigInt(mappedResults),
    },
  });

  // 6. Return recommendations
  return NextResponse.json(
    serializeBigInt({
      recommendationId: recommendation.id,
      interpreted: extracted,
      results: mappedResults,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}


