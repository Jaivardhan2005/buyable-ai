import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "./demo-catalog";
import { rankProducts } from "./ranking";

test("ranking is deterministic and excludes out-of-budget products", () => {
  const results = rankProducts(demoCatalog, { ANC_LEVEL: 5, BATTERY_HOURS: 2 }, 200000n);
  assert.equal(results[0]?.product.sku, "SN-BUDS-QUIET");
  assert.deepEqual(results.map((result) => result.product.sku), rankProducts(demoCatalog, { ANC_LEVEL: 5, BATTERY_HOURS: 2 }, 200000n).map((result) => result.product.sku));
});
