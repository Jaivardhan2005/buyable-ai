import { NextResponse } from "next/server";
import { createBuyerSession, setBuyerSessionCookie } from "@/lib/session.server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const merchantId = (body as Record<string, unknown>)?.merchantId;
  if (typeof merchantId !== "string" || merchantId.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "merchantId is required." } },
      { status: 400 }
    );
  }

  try {
    const { session, rawToken } = await createBuyerSession(merchantId.trim());

    // Set the secure HttpOnly cookie
    await setBuyerSessionCookie(rawToken, session.expiresAt);

    // Return safe session data
    return NextResponse.json(
      {
        id: session.id,
        status: session.status,
        expiresAt: session.expiresAt.toISOString(),
      },
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    // Assuming Prisma errors or missing merchant constraint failures might throw
    if (message.includes("Foreign key constraint failed on the field: `merchant_id`") || message.includes("not found")) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Merchant not found." } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Session creation failed." } },
      { status: 500 }
    );
  }
}
