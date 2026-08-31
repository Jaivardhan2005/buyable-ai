import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { prisma, withDb } from "@/lib/prisma";
import { TransactionStatus, ActorType } from "../../generated/prisma";
import { recordAuditEvent } from "./audit.server";
import {
  PaymentError,
  RazorpayOrderSnapshot,
  VerifyPaymentInput,
  PaymentVerificationResult,
} from "./payment";

// In-memory payment and transaction fallback store for resilience and test execution
type MemoryTransactionRecord = {
  id: string;
  merchantId: string;
  sessionId: string;
  cartId: string;
  amountPaise: bigint;
  currency: string;
  status: TransactionStatus;
  idempotencyKey: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const memoryTransactionStore = new Map<string, MemoryTransactionRecord>();

// Custom handler hook for mocking in unit tests
type RazorpayOrderCreator = (params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) => Promise<{ id: string; amount: number; currency: string }>;

let customOrderCreator: RazorpayOrderCreator | null = null;

export function setRazorpayOrderMock(mockCreator: RazorpayOrderCreator | null) {
  customOrderCreator = mockCreator;
}

export function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_default_key";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_default_secret";
  return { keyId, keySecret };
}

export function generateRazorpaySignature(
  orderId: string,
  paymentId: string,
  secret: string
): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const expected = generateRazorpaySignature(orderId, paymentId, secret);
    const expectedBuf = Buffer.from(expected, "utf-8");
    const actualBuf = Buffer.from(signature, "utf-8");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

async function callRazorpayOrderApi(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  if (customOrderCreator) {
    return customOrderCreator(params);
  }

  const { keyId, keySecret } = getRazorpayCredentials();

  // If live credentials are configured and not default mock strings, make real Razorpay API call
  if (
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    !process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_default")
  ) {
    const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.description || "Razorpay order creation failed.";
      throw new PaymentError(errorMsg, "RAZORPAY_API_ERROR", 502);
    }

    return response.json();
  }

  // Simulated test mode / local dev order generation
  const mockOrderId = `order_mock_${randomUUID().replace(/-/g, "").substring(0, 14)}`;
  return {
    id: mockOrderId,
    amount: params.amountPaise,
    currency: params.currency,
  };
}

export function registerMemoryTransaction(tx: MemoryTransactionRecord) {
  memoryTransactionStore.set(tx.id, tx);
}

export async function createRazorpayPaymentOrder(
  sessionId: string,
  transactionId: string
): Promise<RazorpayOrderSnapshot> {
  if (!sessionId) {
    throw new PaymentError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
    throw new PaymentError("transactionId is required.", "INVALID_TRANSACTION_ID", 400);
  }

  const { keyId } = getRazorpayCredentials();

  // 1. Retrieve Authoritative Transaction from Database / Memory Store
  const transaction = await withDb(
    async () => {
      return prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { merchant: true },
      });
    },
    () => {
      const memTx = memoryTransactionStore.get(transactionId);
      if (memTx) {
        return {
          id: memTx.id,
          merchantId: memTx.merchantId,
          sessionId: memTx.sessionId,
          cartId: memTx.cartId,
          amountPaise: memTx.amountPaise,
          currency: memTx.currency,
          status: memTx.status,
          idempotencyKey: memTx.idempotencyKey,
          razorpayOrderId: memTx.razorpayOrderId ?? null,
          razorpayPaymentId: memTx.razorpayPaymentId ?? null,
          confirmedAt: memTx.confirmedAt ?? null,
          createdAt: memTx.createdAt,
          updatedAt: memTx.updatedAt,
          merchant: { name: "SoundNest Electronics" },
        };
      }
      return null;
    }
  );

  if (!transaction) {
    throw new PaymentError("Transaction not found.", "TRANSACTION_NOT_FOUND", 404);
  }

  // 2. Validate Ownership
  if (transaction.sessionId !== sessionId) {
    throw new PaymentError(
      "Transaction does not belong to the active session.",
      "UNAUTHORIZED_TRANSACTION",
      403
    );
  }

  // 3. Validate Payable State
  if (
    transaction.status === TransactionStatus.CAPTURED ||
    transaction.status === TransactionStatus.AUTHENTICATED
  ) {
    throw new PaymentError("This transaction is already paid.", "ALREADY_PAID", 400);
  }

  // 4. Validate Authoritative Amount
  const amountPaise = BigInt(transaction.amountPaise);
  if (amountPaise <= 0n) {
    throw new PaymentError("Invalid transaction amount.", "INVALID_AMOUNT", 400);
  }

  const numericPaise = Number(amountPaise);
  if (!Number.isSafeInteger(numericPaise) || numericPaise <= 0) {
    throw new PaymentError("Amount must be a positive integer in paise.", "INVALID_AMOUNT", 400);
  }

  // 5. Idempotent Reuse if Active Order Already Exists
  if (transaction.razorpayOrderId && transaction.status === TransactionStatus.PENDING_PAYMENT) {
    return {
      keyId,
      razorpayOrderId: transaction.razorpayOrderId,
      amountPaise: amountPaise.toString(),
      currency: "INR",
      transactionId: transaction.id,
      merchantName: transaction.merchant?.name || "SoundNest Audio",
      description: `Buyable Order #${transaction.id.substring(0, 8)}`,
    };
  }

  // 6. Call Razorpay API to Create Order
  const razorpayOrder = await callRazorpayOrderApi({
    amountPaise: numericPaise,
    currency: "INR",
    receipt: transaction.id,
    notes: {
      buyableTransactionId: transaction.id,
      sessionId,
      merchantId: transaction.merchantId,
    },
  });

  // 7. Update Transaction Status and Store Razorpay Order ID
  await withDb(
    async () => {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          razorpayOrderId: razorpayOrder.id,
          status: TransactionStatus.PENDING_PAYMENT,
        },
      });
    },
    () => {
      const memTx = memoryTransactionStore.get(transaction.id);
      if (memTx) {
        memTx.razorpayOrderId = razorpayOrder.id;
        memTx.status = TransactionStatus.PENDING_PAYMENT;
        memTx.updatedAt = new Date();
      }
    }
  );

  // 8. Record Audit Event
  await recordAuditEvent({
    sessionId,
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "RAZORPAY_ORDER_CREATED",
    entityType: "Transaction",
    entityId: transaction.id,
    outcome: "SUCCESS",
    reason: `Created Razorpay Order ${razorpayOrder.id} for amount ₹${numericPaise / 100}`,
    metadata: {
      transactionId: transaction.id,
      razorpayOrderId: razorpayOrder.id,
      amountPaise: amountPaise.toString(),
      currency: "INR",
    },
  });

  // 9. Return Safe Public Checkout Information (Secret is NEVER returned)
  return {
    keyId,
    razorpayOrderId: razorpayOrder.id,
    amountPaise: amountPaise.toString(),
    currency: "INR",
    transactionId: transaction.id,
    merchantName: transaction.merchant?.name || "SoundNest Audio",
    description: `Buyable Order #${transaction.id.substring(0, 8)}`,
  };
}

export async function verifyBuyerPayment(
  sessionId: string,
  input: VerifyPaymentInput
): Promise<PaymentVerificationResult> {
  if (!sessionId) {
    throw new PaymentError("A valid buyer session is required.", "UNAUTHORIZED", 401);
  }

  const { transactionId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = input || {};

  if (!transactionId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new PaymentError(
      "Missing required payment verification fields.",
      "MISSING_PAYMENT_FIELDS",
      400
    );
  }

  const { keySecret } = getRazorpayCredentials();

  // 1. Audit Verification Start
  await recordAuditEvent({
    sessionId,
    transactionId,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "PAYMENT_VERIFICATION_STARTED",
    entityType: "Transaction",
    entityId: transactionId,
    outcome: "SUCCESS",
    reason: `Initiated signature verification for payment ${razorpayPaymentId}`,
    metadata: {
      transactionId,
      razorpayOrderId,
      razorpayPaymentId,
    },
  });

  // 2. Fetch Authoritative Transaction
  const transaction = await withDb(
    async () => {
      return prisma.transaction.findUnique({
        where: { id: transactionId },
      });
    },
    () => {
      const memTx = memoryTransactionStore.get(transactionId);
      if (memTx) {
        return {
          id: memTx.id,
          merchantId: memTx.merchantId,
          sessionId: memTx.sessionId,
          cartId: memTx.cartId,
          amountPaise: memTx.amountPaise,
          currency: memTx.currency,
          status: memTx.status,
          idempotencyKey: memTx.idempotencyKey,
          razorpayOrderId: memTx.razorpayOrderId ?? null,
          razorpayPaymentId: memTx.razorpayPaymentId ?? null,
          confirmedAt: memTx.confirmedAt ?? null,
          createdAt: memTx.createdAt,
          updatedAt: memTx.updatedAt,
        };
      }
      return null;
    }
  );

  if (!transaction) {
    throw new PaymentError("Transaction not found.", "TRANSACTION_NOT_FOUND", 404);
  }

  // 3. Validate Session Ownership
  if (transaction.sessionId !== sessionId) {
    throw new PaymentError(
      "Transaction does not belong to the active session.",
      "UNAUTHORIZED_TRANSACTION",
      403
    );
  }

  // 4. Idempotency Check: Already verified with same payment ID
  if (
    transaction.status === TransactionStatus.CAPTURED &&
    transaction.razorpayPaymentId === razorpayPaymentId
  ) {
    return {
      verified: true,
      transactionId: transaction.id,
      status: TransactionStatus.CAPTURED,
      razorpayOrderId: transaction.razorpayOrderId || razorpayOrderId,
      razorpayPaymentId: transaction.razorpayPaymentId,
      amountPaise: transaction.amountPaise.toString(),
      currency: "INR",
      confirmedAt: transaction.confirmedAt?.toISOString() || new Date().toISOString(),
    };
  }

  // 5. Conflict Check: Already verified with a different payment ID
  if (
    transaction.status === TransactionStatus.CAPTURED &&
    transaction.razorpayPaymentId !== razorpayPaymentId
  ) {
    throw new PaymentError(
      "Transaction is already verified with another payment ID.",
      "PAYMENT_CONFLICT",
      409
    );
  }

  // 6. Verify Razorpay Order ID Matches Transaction
  if (transaction.razorpayOrderId && transaction.razorpayOrderId !== razorpayOrderId) {
    await recordAuditEvent({
      sessionId,
      merchantId: transaction.merchantId,
      transactionId: transaction.id,
      actorType: ActorType.CUSTOMER_SESSION,
      action: "PAYMENT_VERIFICATION_FAILED",
      entityType: "Transaction",
      entityId: transaction.id,
      outcome: "BLOCKED",
      reason: `Mismatched Razorpay Order ID. Expected: ${transaction.razorpayOrderId}, Received: ${razorpayOrderId}`,
      metadata: { transactionId, expectedOrderId: transaction.razorpayOrderId, receivedOrderId: razorpayOrderId },
    });
    throw new PaymentError("Razorpay order ID does not match transaction.", "ORDER_MISMATCH", 400);
  }

  // 7. Perform Server-Side Cryptographic Signature Verification
  const isSignatureValid = verifyRazorpayPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    keySecret
  );

  if (!isSignatureValid) {
    await recordAuditEvent({
      sessionId,
      merchantId: transaction.merchantId,
      transactionId: transaction.id,
      actorType: ActorType.CUSTOMER_SESSION,
      action: "PAYMENT_VERIFICATION_FAILED",
      entityType: "Transaction",
      entityId: transaction.id,
      outcome: "FAILED",
      reason: "Cryptographic signature verification failed.",
      metadata: {
        transactionId,
        razorpayOrderId,
        razorpayPaymentId,
      },
    });

    throw new PaymentError("Invalid payment signature.", "INVALID_SIGNATURE", 400);
  }

  // 8. Update Transaction to CAPTURED State
  const confirmedAt = new Date();

  await withDb(
    async () => {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          razorpayOrderId,
          razorpayPaymentId,
          status: TransactionStatus.CAPTURED,
          confirmedAt,
        },
      });
    },
    () => {
      const memTx = memoryTransactionStore.get(transaction.id);
      if (memTx) {
        memTx.razorpayOrderId = razorpayOrderId;
        memTx.razorpayPaymentId = razorpayPaymentId;
        memTx.status = TransactionStatus.CAPTURED;
        memTx.confirmedAt = confirmedAt;
        memTx.updatedAt = new Date();
      }
    }
  );

  // 9. Record Success Audit Event
  await recordAuditEvent({
    sessionId,
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: ActorType.CUSTOMER_SESSION,
    action: "PAYMENT_VERIFIED",
    entityType: "Transaction",
    entityId: transaction.id,
    outcome: "SUCCESS",
    reason: `Payment verified successfully for ₹${Number(transaction.amountPaise) / 100}`,
    metadata: {
      transactionId: transaction.id,
      razorpayOrderId,
      razorpayPaymentId,
      amountPaise: transaction.amountPaise.toString(),
      currency: "INR",
    },
  });

  return {
    verified: true,
    transactionId: transaction.id,
    status: TransactionStatus.CAPTURED,
    razorpayOrderId,
    razorpayPaymentId,
    amountPaise: transaction.amountPaise.toString(),
    currency: "INR",
    confirmedAt: confirmedAt.toISOString(),
  };
}
