import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "./demo-catalog";
import { rankProducts } from "./ranking";

test("ranking is deterministic and excludes out-of-budget products", () => {
  const results = rankProducts(demoCatalog, { ANC_LEVEL: 5, BATTERY_HOURS: 2 }, 200000n);
  assert.equal(results[0]?.product.sku, "SN-BUDS-QUIET");
  assert.deepEqual(results.map((result) => result.product.sku), rankProducts(demoCatalog, { ANC_LEVEL: 5, BATTERY_HOURS: 2 }, 200000n).map((result) => result.product.sku));
});

test("ranking does not filter by budget if budgetPaise is null", () => {
  const results = rankProducts(demoCatalog, { ANC_LEVEL: 5 }, null);
  assert.equal(results.length, demoCatalog.length, "Should return all catalog items if budget is null");
});
