import test from "node:test";
import assert from "node:assert/strict";
import {
  createRazorpayPaymentOrder,
  verifyBuyerPayment,
  generateRazorpaySignature,
  verifyRazorpayPaymentSignature,
  registerMemoryTransaction,
  setRazorpayOrderMock,
  getRazorpayCredentials,
} from "./payment.server";
import { getMemoryAuditEvents } from "./audit.server";
import { TransactionStatus } from "../../generated/prisma";

const TEST_SESSION_A = "test-buyer-session-aaa-111";
const TEST_SESSION_B = "test-buyer-session-bbb-222";
const TEST_MERCHANT_ID = "merchant-demo-001";

// Helper to seed a test transaction in memory
function seedTestTransaction(params: {
  id: string;
  sessionId: string;
  amountPaise: bigint;
  status?: TransactionStatus;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  registerMemoryTransaction({
    id: params.id,
    merchantId: TEST_MERCHANT_ID,
    sessionId: params.sessionId,
    cartId: "cart-mock-123",
    amountPaise: params.amountPaise,
    currency: "INR",
    status: params.status || TransactionStatus.CREATED,
    idempotencyKey: `idemp-${params.id}`,
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

test("Payment: creates valid Razorpay order for payable transaction", async () => {
  seedTestTransaction({
    id: "tx-valid-001",
    sessionId: TEST_SESSION_A,
    amountPaise: 999700n, // ₹9,997
  });

  const order = await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-valid-001");

  assert.ok(order.razorpayOrderId);
  assert.equal(order.amountPaise, "999700");
  assert.equal(order.currency, "INR");
  assert.equal(order.transactionId, "tx-valid-001");
  assert.ok(order.keyId);
  // Verify secret is NEVER returned in response
  assert.equal((order as unknown as Record<string, unknown>).keySecret, undefined);
  assert.equal((order as unknown as Record<string, unknown>).secret, undefined);
});

test("Payment: rejects order creation with missing/invalid session", async () => {
  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder("", "tx-valid-001");
    },
    { name: "PaymentError", code: "UNAUTHORIZED" }
  );
});

test("Payment: rejects nonexistent transaction", async () => {
  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "nonexistent-tx-999");
    },
    { name: "PaymentError", code: "TRANSACTION_NOT_FOUND" }
  );
});

test("Payment: rejects transaction owned by another session", async () => {
  seedTestTransaction({
    id: "tx-owned-by-b",
    sessionId: TEST_SESSION_B,
    amountPaise: 399900n,
  });

  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-owned-by-b");
    },
    { name: "PaymentError", code: "UNAUTHORIZED_TRANSACTION" }
  );
});

test("Payment: rejects order creation for already-paid transaction", async () => {
  seedTestTransaction({
    id: "tx-already-paid-001",
    sessionId: TEST_SESSION_A,
    amountPaise: 599900n,
    status: TransactionStatus.CAPTURED,
    razorpayOrderId: "order_mock_already_paid",
    razorpayPaymentId: "pay_mock_12345",
  });

  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-already-paid-001");
    },
    { name: "PaymentError", code: "ALREADY_PAID" }
  );
});

test("Payment: authoritative amount integrity (client amount tampering protection)", async () => {
  // Database authoritative amount is 999700 paise (₹9,997)
  seedTestTransaction({
    id: "tx-authoritative-amt",
    sessionId: TEST_SESSION_A,
    amountPaise: 999700n,
  });

  // Client creates Razorpay order - client cannot pass an amount
  const order = await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-authoritative-amt");

  // The created Razorpay order MUST be exactly 999700 paise, NOT ₹1 or anything client-controlled
  assert.equal(order.amountPaise, "999700");
  assert.equal(typeof order.amountPaise, "string");
  assert.equal(Number(order.amountPaise), 999700);
});

test("Payment: rejects zero or negative transaction amounts", async () => {
  seedTestTransaction({
    id: "tx-zero-amount",
    sessionId: TEST_SESSION_A,
    amountPaise: 0n,
  });

  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-zero-amount");
    },
    { name: "PaymentError", code: "INVALID_AMOUNT" }
  );

  seedTestTransaction({
    id: "tx-neg-amount",
    sessionId: TEST_SESSION_A,
    amountPaise: -500n,
  });

  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-neg-amount");
    },
    { name: "PaymentError", code: "INVALID_AMOUNT" }
  );
});

test("Payment: idempotent order creation reuses existing active order ID", async () => {
  seedTestTransaction({
    id: "tx-idempotent-order",
    sessionId: TEST_SESSION_A,
    amountPaise: 149900n,
    status: TransactionStatus.PENDING_PAYMENT,
    razorpayOrderId: "order_mock_existing_idempotent",
  });

  const order = await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-idempotent-order");
  assert.equal(order.razorpayOrderId, "order_mock_existing_idempotent");
});

test("Payment: handles Razorpay API order creation failure gracefully", async () => {
  seedTestTransaction({
    id: "tx-api-fail",
    sessionId: TEST_SESSION_A,
    amountPaise: 299900n,
  });

  setRazorpayOrderMock(async () => {
    throw new Error("Razorpay upstream gateway timeout");
  });

  await assert.rejects(
    async () => {
      await createRazorpayPaymentOrder(TEST_SESSION_A, "tx-api-fail");
    }
  );

  setRazorpayOrderMock(null); // Reset mock
});

test("Payment: cryptographic signature verification helper works with timingSafeEqual", () => {
  const { keySecret } = getRazorpayCredentials();
  const orderId = "order_test_987654";
  const paymentId = "pay_test_123456";

  const validSig = generateRazorpaySignature(orderId, paymentId, keySecret);
  const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, validSig, keySecret);
  assert.equal(isValid, true);

  const isInvalid = verifyRazorpayPaymentSignature(orderId, paymentId, "forged_signature_xyz", keySecret);
  assert.equal(isInvalid, false);

  const isAlteredPayment = verifyRazorpayPaymentSignature(orderId, "pay_altered_999", validSig, keySecret);
  assert.equal(isAlteredPayment, false);
});

test("Payment: valid signature verification captures transaction and records confirmedAt", async () => {
  const { keySecret } = getRazorpayCredentials();
  const orderId = "order_verify_ok_001";
  const paymentId = "pay_verify_ok_001";
  const signature = generateRazorpaySignature(orderId, paymentId, keySecret);

  seedTestTransaction({
    id: "tx-verify-ok",
    sessionId: TEST_SESSION_A,
    amountPaise: 999700n,
    status: TransactionStatus.PENDING_PAYMENT,
    razorpayOrderId: orderId,
  });

  const result = await verifyBuyerPayment(TEST_SESSION_A, {
    transactionId: "tx-verify-ok",
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  assert.equal(result.verified, true);
  assert.equal(result.status, TransactionStatus.CAPTURED);
  assert.equal(result.razorpayPaymentId, paymentId);
  assert.equal(result.amountPaise, "999700");
  assert.ok(result.confirmedAt);
});

test("Payment: rejects invalid signature and logs audit failure", async () => {
  seedTestTransaction({
    id: "tx-verify-invalid-sig",
    sessionId: TEST_SESSION_A,
    amountPaise: 399900n,
    status: TransactionStatus.PENDING_PAYMENT,
    razorpayOrderId: "order_invalid_sig_123",
  });

  await assert.rejects(
    async () => {
      await verifyBuyerPayment(TEST_SESSION_A, {
        transactionId: "tx-verify-invalid-sig",
        razorpayOrderId: "order_invalid_sig_123",
        razorpayPaymentId: "pay_some_id",
        razorpaySignature: "invalid_tampered_signature_hex",
      });
    },
    { name: "PaymentError", code: "INVALID_SIGNATURE" }
  );

  const auditEvents = getMemoryAuditEvents({ transactionId: "tx-verify-invalid-sig" });
  assert.ok(auditEvents.some((e) => e.action === "PAYMENT_VERIFICATION_FAILED"));
});

test("Payment: rejects verification when missing required fields", async () => {
  await assert.rejects(
    async () => {
      await verifyBuyerPayment(TEST_SESSION_A, {
        transactionId: "tx-verify-ok",
        razorpayOrderId: "",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "sig_123",
      });
    },
    { name: "PaymentError", code: "MISSING_PAYMENT_FIELDS" }
  );
});

test("Payment: rejects verification if Razorpay order ID does not match transaction", async () => {
  const { keySecret } = getRazorpayCredentials();
  const legitimateOrderId = "order_legit_100";
  const rogueOrderId = "order_rogue_999";
  const paymentId = "pay_test_777";
  const signature = generateRazorpaySignature(rogueOrderId, paymentId, keySecret);

  seedTestTransaction({
    id: "tx-mismatched-order",
    sessionId: TEST_SESSION_A,
    amountPaise: 449900n,
    status: TransactionStatus.PENDING_PAYMENT,
    razorpayOrderId: legitimateOrderId,
  });

  await assert.rejects(
    async () => {
      await verifyBuyerPayment(TEST_SESSION_A, {
        transactionId: "tx-mismatched-order",
        razorpayOrderId: rogueOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });
    },
    { name: "PaymentError", code: "ORDER_MISMATCH" }
  );
});

test("Payment: repeated verification returns existing verified state (idempotency)", async () => {
  const { keySecret } = getRazorpayCredentials();
  const orderId = "order_idemp_200";
  const paymentId = "pay_idemp_200";
  const signature = generateRazorpaySignature(orderId, paymentId, keySecret);

  seedTestTransaction({
    id: "tx-verify-idemp",
    sessionId: TEST_SESSION_A,
    amountPaise: 199900n,
    status: TransactionStatus.PENDING_PAYMENT,
    razorpayOrderId: orderId,
  });

  // First verification
  const first = await verifyBuyerPayment(TEST_SESSION_A, {
    transactionId: "tx-verify-idemp",
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });
  assert.equal(first.status, TransactionStatus.CAPTURED);

  // Second verification retry with same payment ID
  const second = await verifyBuyerPayment(TEST_SESSION_A, {
    transactionId: "tx-verify-idemp",
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });
  assert.equal(second.status, TransactionStatus.CAPTURED);
  assert.equal(second.razorpayPaymentId, paymentId);
});

test("Payment: rejects verification if already captured with conflicting payment ID", async () => {
  const { keySecret } = getRazorpayCredentials();
  const orderId = "order_conflict_300";
  const initialPaymentId = "pay_initial_300";
  const roguePaymentId = "pay_rogue_300";
  const rogueSig = generateRazorpaySignature(orderId, roguePaymentId, keySecret);

  seedTestTransaction({
    id: "tx-conflict-pay",
    sessionId: TEST_SESSION_A,
    amountPaise: 299900n,
    status: TransactionStatus.CAPTURED,
    razorpayOrderId: orderId,
    razorpayPaymentId: initialPaymentId,
  });

  await assert.rejects(
    async () => {
      await verifyBuyerPayment(TEST_SESSION_A, {
        transactionId: "tx-conflict-pay",
        razorpayOrderId: orderId,
        razorpayPaymentId: roguePaymentId,
        razorpaySignature: rogueSig,
      });
    },
    { name: "PaymentError", code: "PAYMENT_CONFLICT" }
  );
});

test("Payment: audit trail emits RAZORPAY_ORDER_CREATED and PAYMENT_VERIFIED without secrets", async () => {
  const { keySecret } = getRazorpayCredentials();
  const txId = "tx-audit-check-500";
  const paymentId = "pay_audit_500";

  seedTestTransaction({
    id: txId,
    sessionId: TEST_SESSION_A,
    amountPaise: 799900n,
  });

  const order = await createRazorpayPaymentOrder(TEST_SESSION_A, txId);
  const signature = generateRazorpaySignature(order.razorpayOrderId, paymentId, keySecret);

  await verifyBuyerPayment(TEST_SESSION_A, {
    transactionId: txId,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  const auditEvents = getMemoryAuditEvents({ transactionId: txId });
  assert.ok(auditEvents.some((e) => e.action === "RAZORPAY_ORDER_CREATED"));
  assert.ok(auditEvents.some((e) => e.action === "PAYMENT_VERIFIED"));

  // Verify secret is NEVER logged anywhere in audit records
  for (const evt of auditEvents) {
    const serialized = JSON.stringify(evt);
    assert.equal(serialized.includes(keySecret), false);
    assert.equal(serialized.includes("secret"), false);
  }
});
