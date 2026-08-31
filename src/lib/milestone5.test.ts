import assert from "node:assert/strict";
import test from "node:test";
import { demoCatalog } from "./demo-catalog";
import { rankProducts, normalizeCategory } from "./ranking";
import { extractPreferencesRuleBased } from "./llm.server";
import { generateExplanationDetails } from "./explanation";

test("Category normalizer handles various aliases accurately", () => {
  assert.equal(normalizeCategory("speaker"), "speakers");
  assert.equal(normalizeCategory("Bluetooth Speakers"), "speakers");
  assert.equal(normalizeCategory("Soundbar"), "speakers");
  assert.equal(normalizeCategory("earbud"), "earbuds");
  assert.equal(normalizeCategory("TWS Earbuds"), "earbuds");
  assert.equal(normalizeCategory("In-ear"), "earbuds");
  assert.equal(normalizeCategory("Headphones"), "headphones");
  assert.equal(normalizeCategory("Over-ear headset"), "headphones");
});

test("Category strict filtering: 'speakers under ₹4,000 with good bass'", () => {
  const prefs = extractPreferencesRuleBased("speakers under ₹4,000 with good bass");
  assert.equal(prefs.category, "speakers");
  assert.equal(prefs.budgetPaise, 400000n);
  assert.ok((prefs.weights.BASS ?? 0) >= 90);

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category);
  assert.ok(ranked.length > 0);
  
  // Verify ALL recommended products are strictly speakers and under ₹4,000
  for (const item of ranked) {
    assert.equal(item.product.category, "speakers");
    assert.ok(item.product.pricePaise <= 400000n);
  }

  // Verify rank 1 is the highest bass speaker in budget
  assert.equal(ranked[0].product.sku, "SN-SPK-PRO");
  assert.equal(ranked[0].product.attributes.BASS, 98);

  // Verify 'Why this?' and strengths
  const details1 = generateExplanationDetails(ranked[0], 0, ranked, prefs.weights, prefs.budgetPaise);
  assert.ok(details1.explanation.length > 0);
  assert.ok(details1.strengths.some((s) => s.includes("Bass")));

  if (ranked.length > 1) {
    const details2 = generateExplanationDetails(ranked[1], 1, ranked, prefs.weights, prefs.budgetPaise);
    assert.ok(details2.explanation.length > 0);
    // Explanations should be meaningfully different
    assert.notEqual(details1.explanation, details2.explanation);
  }
});

test("Category strict filtering: 'earbuds with ANC under ₹5,000'", () => {
  const prefs = extractPreferencesRuleBased("earbuds with ANC under ₹5,000");
  assert.equal(prefs.category, "earbuds");
  assert.equal(prefs.budgetPaise, 500000n);
  assert.ok((prefs.weights.ANC_LEVEL ?? 0) >= 90);

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category);
  assert.ok(ranked.length > 0);

  for (const item of ranked) {
    assert.equal(item.product.category, "earbuds");
    assert.ok(item.product.pricePaise <= 500000n);
  }

  // Best ANC earbud in budget is Buds Pro (ANC 95)
  assert.equal(ranked[0].product.sku, "SN-BUDS-PRO");
  assert.equal(ranked[0].product.attributes.ANC_LEVEL, 95);
});

test("Category strict filtering: 'headphones for travel'", () => {
  const prefs = extractPreferencesRuleBased("headphones for travel");
  assert.equal(prefs.category, "headphones");
  assert.ok((prefs.weights.ANC_LEVEL ?? 0) >= 80);
  assert.ok(prefs.useCases?.includes("travel"));

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category, {
    useCases: prefs.useCases,
  });
  assert.ok(ranked.length > 0);

  for (const item of ranked) {
    assert.equal(item.product.category, "headphones");
  }

  // Top travel headphone
  assert.ok(ranked[0].product.attributes.ANC_LEVEL >= 90);
});

test("Feature & Category accuracy: 'wireless speaker with long battery life'", () => {
  const prefs = extractPreferencesRuleBased("wireless speaker with long battery life");
  assert.equal(prefs.category, "speakers");
  assert.ok((prefs.weights.BATTERY_HOURS ?? 0) >= 80);

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category, {
    requestedFeatures: prefs.requestedFeatures,
  });
  assert.ok(ranked.length > 0);

  for (const item of ranked) {
    assert.equal(item.product.category, "speakers");
  }

  // Trekker 360 has 98 battery hours score (30h battery)
  assert.equal(ranked[0].product.sku, "SN-SPK-TREKKER360");
});

test("Feature & Category accuracy: 'earbuds with good microphone'", () => {
  const prefs = extractPreferencesRuleBased("earbuds with good microphone");
  assert.equal(prefs.category, "earbuds");
  assert.ok((prefs.weights.MICROPHONE ?? 0) >= 90);

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category);
  assert.ok(ranked.length > 0);

  for (const item of ranked) {
    assert.equal(item.product.category, "earbuds");
  }

  // Buds Clear has 95 microphone score
  assert.equal(ranked[0].product.sku, "SN-BUDS-CLEAR");
});

test("Budget & Category accuracy: 'cheap headphones'", () => {
  const prefs = extractPreferencesRuleBased("cheap headphones");
  assert.equal(prefs.category, "headphones");
  assert.equal(prefs.pricePreference, "budget");

  const ranked = rankProducts(demoCatalog, prefs.weights, prefs.budgetPaise, prefs.category);
  assert.ok(ranked.length > 0);

  for (const item of ranked) {
    assert.equal(item.product.category, "headphones");
  }
});
