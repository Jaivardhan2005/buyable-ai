import { NextResponse } from "next/server";
import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { createRazorpayPaymentOrder } from "@/lib/payment.server";
import { PaymentError } from "@/lib/payment";

export async function POST(request: Request) {
  const session = await getBuyerSessionFromCookie();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "A valid buyer session is required." } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const transactionId = (body as Record<string, unknown>)?.transactionId;
  if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "transactionId is required." } },
      { status: 400 }
    );
  }

  try {
    const orderSnapshot = await createRazorpayPaymentOrder(session.id, transactionId.trim());
    return NextResponse.json(orderSnapshot, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("Unhandled error creating Razorpay order:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create payment order." } },
      { status: 500 }
    );
  }
}
