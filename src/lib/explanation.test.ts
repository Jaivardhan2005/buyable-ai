import test from "node:test";
import assert from "node:assert/strict";
import { generateExplanation, RankedResult } from "./explanation";
import { DemoProduct } from "./demo-catalog";
import { PreferenceWeights } from "./ranking";

function mockProduct(sku: string, pricePaise: bigint, attributes: Record<string, number>): DemoProduct {
  return {
    sku,
    name: `Test ${sku}`,
    brand: "Test",
    description: "Test description",
    pricePaise,
    availableQty: 10,
    category: "test",
    attributes: attributes as any,
  };
}

test("generateExplanation produces deterministic output for rank 1", () => {
  const p1 = mockProduct("P1", 2000n, { BASS: 100, ANC_LEVEL: 50 });
  const results: RankedResult[] = [{ product: p1, score: 100 }];
  const weights: PreferenceWeights = { BASS: 100 };
  
  const explanation = generateExplanation(results[0], 0, results, weights, null);
  assert.match(explanation, /Best overall match.*strong bass/);
});

test("generateExplanation includes budget text if under budget", () => {
  const p1 = mockProduct("P1", 200000n, { BASS: 100, ANC_LEVEL: 50 });
  const results: RankedResult[] = [{ product: p1, score: 100 }];
  const weights: PreferenceWeights = { BASS: 100 };
  
  const explanation = generateExplanation(results[0], 0, results, weights, 260000n);
  assert.match(explanation, /comfortably under your budget/);
});

test("generateExplanation explains cheaper trade-off for lower ranks", () => {
  const p1 = mockProduct("P1", 5000n, { BASS: 100 });
  const p2 = mockProduct("P2", 3000n, { BASS: 80 });
  const results: RankedResult[] = [{ product: p1, score: 100 }, { product: p2, score: 80 }];
  const weights: PreferenceWeights = { BASS: 100 };
  
  const explanation = generateExplanation(results[1], 1, results, weights, null);
  assert.match(explanation, /trading some bass performance for a lower price/);
});

test("generateExplanation handles no preferences", () => {
  const p1 = mockProduct("P1", 5000n, { BASS: 10, ANC_LEVEL: 90 });
  const results: RankedResult[] = [{ product: p1, score: 0 }];
  
  const explanation = generateExplanation(results[0], 0, results, {}, null);
  assert.match(explanation, /excellent anc level/);
});
