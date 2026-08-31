import { NextResponse } from "next/server";
import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { createBuyerOrder } from "@/lib/order.server";
import { OrderError } from "@/lib/order";

export async function POST(request: Request) {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Body is optional
  }

  const headerIdemp = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key");
  const bodyIdemp = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined;
  const idempotencyKey = headerIdemp?.trim() || bodyIdemp;

  try {
    const order = await createBuyerOrder(session.id, session.merchantId, {
      idempotencyKey,
    });
    return NextResponse.json(order, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create order." } }, { status: 500 });
  }
}
