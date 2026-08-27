import { NextResponse } from "next/server";
import { createMerchantReadinessAssessment } from "@/lib/readiness-assessment.server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const merchantId = (body as Record<string, unknown>)?.merchantId;
  if (typeof merchantId !== "string" || merchantId.trim().length === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "merchantId is required." } }, { status: 400 });
  }

  try {
    const assessment = await createMerchantReadinessAssessment(merchantId.trim());

    return NextResponse.json(assessment, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (message.includes("was not found")) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message } }, { status: 404 });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Assessment failed." } }, { status: 500 });
  }
}
