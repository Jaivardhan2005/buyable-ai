import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { extractPreferences } from "@/lib/llm.server";
import { getPublishedCatalog } from "@/lib/catalog.server";
import { prisma, withDb } from "@/lib/prisma";
import { handleRecommendation } from "./handler";
import type { Prisma } from "../../../../../generated/prisma";

export async function POST(request: Request) {
  return handleRecommendation(
    request,
    getBuyerSessionFromCookie,
    extractPreferences,
    getPublishedCatalog,
    (data) =>
      withDb(
        () => prisma.recommendation.create(data),
        () => ({
          id: "rec-" + Date.now(),
          sessionId: (data.data.sessionId || "demo-session") as string,
          requestSnapshot: (data.data.requestSnapshot || {}) as Prisma.JsonValue,
          candidates: (data.data.candidates || []) as Prisma.JsonValue,
          rankedResults: (data.data.rankedResults || []) as Prisma.JsonValue,
          createdAt: new Date(),
        })
      )
  );
}
