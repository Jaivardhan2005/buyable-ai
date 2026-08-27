import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { extractPreferences } from "@/lib/llm.server";
import { getPublishedCatalog } from "@/lib/catalog.server";
import { prisma } from "@/lib/prisma";
import { handleRecommendation } from "./handler";

export async function POST(request: Request) {
  return handleRecommendation(
    request,
    getBuyerSessionFromCookie,
    extractPreferences,
    getPublishedCatalog,
    (data) => prisma.recommendation.create(data)
  );
}
