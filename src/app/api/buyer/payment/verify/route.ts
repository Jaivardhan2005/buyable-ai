import { NextResponse } from "next/server";
import { getBuyerSessionFromCookie } from "@/lib/session.server";
import { verifyBuyerPayment } from "@/lib/payment.server";
import { PaymentError, VerifyPaymentInput } from "@/lib/payment";

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

  const { transactionId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = (body || {}) as Partial<VerifyPaymentInput>;

  if (!transactionId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "transactionId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.",
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await verifyBuyerPayment(session.id, {
      transactionId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("Unhandled error verifying payment:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to verify payment." } },
      { status: 500 }
    );
  }
}
