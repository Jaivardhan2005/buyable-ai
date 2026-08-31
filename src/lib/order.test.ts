import test from "node:test";
import assert from "node:assert/strict";
import { addBuyerCartItem, clearBuyerCart } from "./cart.server";
import { createBuyerOrder, getVerifiedMerchantPolicies } from "./order.server";
import { getMemoryAuditEvents } from "./audit.server";

const ORDER_TEST_SESSION_ID = "test-session-order-456";
const ORDER_TEST_MERCHANT_ID = "merchant-demo-001";

test("Order: verified merchant policies return active commercial protections", async () => {
  const policies = await getVerifiedMerchantPolicies(ORDER_TEST_MERCHANT_ID);
  assert.ok(policies.length >= 2);
  assert.ok(policies.some((p) => p.policyType === "RETURN_POLICY"));
  assert.ok(policies.some((p) => p.policyType === "CANCELLATION_POLICY"));
});

test("Order: rejects checkout with an empty cart", async () => {
  await clearBuyerCart(ORDER_TEST_SESSION_ID);

  await assert.rejects(
    async () => {
      await createBuyerOrder(ORDER_TEST_SESSION_ID, ORDER_TEST_MERCHANT_ID);
    },
    { name: "OrderError", code: "EMPTY_CART" }
  );
});

test("Order: creates order snapshot with authoritative prices and items", async () => {
  await clearBuyerCart(ORDER_TEST_SESSION_ID);

  // Add 2 items: 1x FlyMax 900 (₹5,999) + 2x Buds Quiet (₹1,999 * 2 = ₹3,998)
  await addBuyerCartItem(ORDER_TEST_SESSION_ID, ORDER_TEST_MERCHANT_ID, {
    sku: "SN-HP-FLYMAX",
    quantity: 1,
  });
  await addBuyerCartItem(ORDER_TEST_SESSION_ID, ORDER_TEST_MERCHANT_ID, {
    sku: "SN-BUDS-QUIET",
    quantity: 2,
  });

  const order = await createBuyerOrder(ORDER_TEST_SESSION_ID, ORDER_TEST_MERCHANT_ID, {
    idempotencyKey: "test-idemp-key-1001",
  });

  assert.ok(order.orderId);
  assert.ok(order.transactionId);
  assert.equal(order.items.length, 2);
  // Total: ₹5,999 + ₹3,998 = ₹9,997 => 999700 paise
  assert.equal(order.amountPaise, "999700");
  assert.equal(order.currency, "INR");
  assert.equal(order.idempotencyKey, "test-idemp-key-1001");
  assert.ok(order.policies.length >= 2);
});

test("Order: idempotency returns identical order on retry with same key", async () => {
  const retryOrder = await createBuyerOrder(ORDER_TEST_SESSION_ID, ORDER_TEST_MERCHANT_ID, {
    idempotencyKey: "test-idemp-key-1001",
  });

  assert.equal(retryOrder.amountPaise, "999700");
  assert.equal(retryOrder.idempotencyKey, "test-idemp-key-1001");
  assert.equal(retryOrder.items.length, 2);
});

test("Order: audit events are recorded for order creation", async () => {
  const auditEvents = getMemoryAuditEvents({ sessionId: ORDER_TEST_SESSION_ID });
  assert.ok(auditEvents.some((e) => e.action === "ORDER_CREATED"));
});
