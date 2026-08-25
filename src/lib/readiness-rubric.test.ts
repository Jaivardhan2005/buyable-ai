import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadinessScore } from "./readiness-rubric";

test("readiness score uses the published weighted rubric", () => {
  assert.equal(calculateReadinessScore({ catalogCompleteness: 100, attributeQuality: 50, inventoryFreshness: 100, policyClarity: 100, checkoutReadiness: 0, transactionSafety: 100 }), 80);
});

test("readiness score rejects an invalid dimension", () => {
  assert.throws(() => calculateReadinessScore({ catalogCompleteness: 101, attributeQuality: 50, inventoryFreshness: 100, policyClarity: 100, checkoutReadiness: 0, transactionSafety: 100 }));
});
