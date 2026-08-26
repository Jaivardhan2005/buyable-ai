import assert from "node:assert/strict";
import test from "node:test";
import { AttributeKey, MerchantStatus, TransactionStatus, VerificationStatus } from "../../generated/prisma";
import { createReadinessAssessmentWrite, createReadinessSnapshots } from "./readiness-assessment";
import { evaluateMerchantReadiness, type ReadinessMerchantSnapshot } from "./readiness";

const assessedAt = new Date("2026-08-26T12:00:00.000Z");

function snapshot(overrides: Partial<ReadinessMerchantSnapshot> = {}): ReadinessMerchantSnapshot {
  return {
    id: "merchant-id",
    status: MerchantStatus.ACTIVE,
    products: [{ id: "product-id", sku: "SN-READY", name: "Ready Buds", brand: "SoundNest", description: "Complete product", pricePaise: 199900n, currency: "INR", status: "PUBLISHED", inventory: { availableQty: 4, reservedQty: 0, updatedAt: new Date("2026-08-26T11:00:00.000Z") }, attributes: Object.values(AttributeKey).map((key) => ({ key, normalizedScore: 80 })) }],
    policies: [{ id: "policy-id", policyType: "RETURNS", content: "Returns accepted within 7 days.", structuredRules: { returnWindowDays: 7 } }],
    transactions: [{ id: "transaction-id", amountPaise: 199900n, currency: "INR", status: TransactionStatus.CAPTURED, idempotencyKey: "checkout-attempt-1", razorpayOrderId: "order-1", razorpayPaymentId: "payment-1", confirmedAt: new Date("2026-08-26T11:30:00.000Z"), paymentEvents: [{ verificationStatus: VerificationStatus.VERIFIED }] }],
    ...overrides,
  };
}

test("assessment write contains an immutable completed assessment and issue rows", () => {
  const incomplete = snapshot({ policies: [] });
  const write = createReadinessAssessmentWrite(evaluateMerchantReadiness(incomplete, assessedAt), createReadinessSnapshots(incomplete));

  assert.equal(write.status, "COMPLETED");
  assert.equal(write.rubricVersion, "day-2-v1");
  assert.equal(write.issues.length, 1);
  assert.deepEqual(write.issues[0] && { code: write.issues[0].code, severity: write.issues[0].severity }, { code: "POLICY_ACTIVE_MISSING", severity: "BLOCKER" });
  assert.match(write.issues[0]?.evidenceHash ?? "", /^[a-f0-9]{64}$/);
});

test("snapshot hashes are deterministic for unchanged catalog and policy data", () => {
  const first = createReadinessSnapshots(snapshot());
  const second = createReadinessSnapshots(snapshot());

  assert.equal(first.catalogSnapshotHash, second.catalogSnapshotHash);
  assert.equal(first.policySnapshotHash, second.policySnapshotHash);
});

test("snapshot hashes are stable despite source ordering and change when relevant data changes", () => {
  const original = snapshot();
  const reordered = snapshot({ products: [...original.products].reverse(), policies: [...original.policies].reverse() });
  const changed = snapshot({ products: [{ ...original.products[0], pricePaise: 209900n }] });

  assert.equal(createReadinessSnapshots(original).catalogSnapshotHash, createReadinessSnapshots(reordered).catalogSnapshotHash);
  assert.notEqual(createReadinessSnapshots(original).catalogSnapshotHash, createReadinessSnapshots(changed).catalogSnapshotHash);
});

test("creating a new write leaves the prior assessment write unchanged", () => {
  const firstSnapshot = snapshot();
  const first = createReadinessAssessmentWrite(evaluateMerchantReadiness(firstSnapshot, assessedAt), createReadinessSnapshots(firstSnapshot));
  const secondSnapshot = snapshot({ policies: [] });
  const second = createReadinessAssessmentWrite(evaluateMerchantReadiness(secondSnapshot, assessedAt), createReadinessSnapshots(secondSnapshot));

  assert.equal(first.policySnapshotHash, createReadinessSnapshots(firstSnapshot).policySnapshotHash);
  assert.notEqual(first.policySnapshotHash, second.policySnapshotHash);
});
