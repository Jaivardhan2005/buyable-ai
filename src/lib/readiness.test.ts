import assert from "node:assert/strict";
import test from "node:test";
import { AttributeKey, MerchantStatus, TransactionStatus, VerificationStatus } from "../../generated/prisma";
import { evaluateMerchantReadiness, type ReadinessMerchantSnapshot } from "./readiness";

const assessedAt = new Date("2026-08-26T12:00:00.000Z");

function readySnapshot(overrides: Partial<ReadinessMerchantSnapshot> = {}): ReadinessMerchantSnapshot {
  return {
    id: "merchant-id",
    status: MerchantStatus.ACTIVE,
    products: [{ id: "product-id", sku: "SN-READY", name: "Ready Buds", brand: "SoundNest", description: "Complete product", pricePaise: 199900n, currency: "INR", status: "PUBLISHED", inventory: { availableQty: 4, reservedQty: 0, updatedAt: new Date("2026-08-26T11:00:00.000Z") }, attributes: Object.values(AttributeKey).map((key) => ({ key, normalizedScore: 80 })) }],
    policies: [{ id: "policy-id", policyType: "RETURNS", content: "Returns accepted within 7 days.", structuredRules: { returnWindowDays: 7 } }],
    transactions: [{ id: "transaction-id", amountPaise: 199900n, currency: "INR", status: TransactionStatus.CAPTURED, idempotencyKey: "checkout-attempt-1", razorpayOrderId: "order-1", razorpayPaymentId: "payment-1", confirmedAt: new Date("2026-08-26T11:30:00.000Z"), paymentEvents: [{ verificationStatus: VerificationStatus.VERIFIED }] }],
    ...overrides,
  };
}

test("fully ready merchant receives all dimensions and no issues", () => {
  const result = evaluateMerchantReadiness(readySnapshot(), assessedAt);

  assert.deepEqual(result.dimensions, { catalogCompleteness: 100, attributeQuality: 100, inventoryFreshness: 100, policyClarity: 100, checkoutReadiness: 100, transactionSafety: 100 });
  assert.equal(result.score, 100);
  assert.deepEqual(result.issues, []);
});

test("missing and invalid product data reduces catalog completeness", () => {
  const result = evaluateMerchantReadiness(readySnapshot({ products: [{ ...readySnapshot().products[0], sku: "", description: "", pricePaise: 0n, status: "DRAFT" }] }), assessedAt);

  assert.equal(result.dimensions.catalogCompleteness, 43);
  assert.equal(result.issues.find((issue) => issue.code === "CATALOG_REQUIRED_FIELDS_MISSING")?.severity, "WARNING");
});

test("missing inventory blocks inventory readiness", () => {
  const result = evaluateMerchantReadiness(readySnapshot({ products: [{ ...readySnapshot().products[0], inventory: null }] }), assessedAt);

  assert.equal(result.dimensions.inventoryFreshness, 0);
  assert.equal(result.issues.find((issue) => issue.code === "INVENTORY_MISSING")?.severity, "BLOCKER");
});

test("poor or missing attributes reduce attribute quality", () => {
  const result = evaluateMerchantReadiness(readySnapshot({ products: [{ ...readySnapshot().products[0], attributes: [{ key: AttributeKey.BASS, normalizedScore: 101 }] }] }), assessedAt);

  assert.equal(result.dimensions.attributeQuality, 0);
  assert.equal(result.issues.find((issue) => issue.code === "ATTRIBUTE_QUALITY_INCOMPLETE")?.severity, "WARNING");
});

test("missing active policy blocks policy clarity", () => {
  const result = evaluateMerchantReadiness(readySnapshot({ policies: [] }), assessedAt);

  assert.equal(result.dimensions.policyClarity, 0);
  assert.equal(result.issues.find((issue) => issue.code === "POLICY_ACTIVE_MISSING")?.severity, "BLOCKER");
});

test("issue output is deterministic for the same snapshot and assessment time", () => {
  const snapshot = readySnapshot({ policies: [], products: [{ ...readySnapshot().products[0], inventory: null }] });

  assert.deepEqual(evaluateMerchantReadiness(snapshot, assessedAt), evaluateMerchantReadiness(snapshot, assessedAt));
});
