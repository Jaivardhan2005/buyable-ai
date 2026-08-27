import test from "node:test";
import assert from "node:assert/strict";
import { handleRecommendation } from "./route";

const fakeCatalog = {
  merchant: { name: "Fake", slug: "fake" },
  products: [
    { sku: "ITEM-1", pricePaise: 1000n, availableQty: 10, attributes: { BASS: 100, ANC_LEVEL: 10 } },
    { sku: "ITEM-2", pricePaise: 5000n, availableQty: 5, attributes: { BASS: 50, ANC_LEVEL: 90 } },
    { sku: "ITEM-3", pricePaise: 10000n, availableQty: 2, attributes: { BASS: 10, ANC_LEVEL: 100 } },
  ],
};

function buildFakeDeps({
  session = { id: "test-session-123" } as any,
  prefs = { budgetPaise: null, weights: { BASS: 100 } } as any,
  catalog = fakeCatalog as any,
  failsExtraction = false,
  extractionError = new Error("Failed to communicate")
} = {}) {
  let savedRecommendation: any = null;

  return {
    getSession: async () => session,
    extractPrefs: async () => {
      if (failsExtraction) {
        if (extractionError.name !== "ExtractionError") {
          extractionError.name = "ExtractionError";
        }
        throw extractionError;
      }
      return prefs;
    },
    getCatalog: async () => catalog,
    saveRecommendation: async (data: any) => {
      savedRecommendation = data;
      return { id: "rec-123" };
    },
    getSavedRecommendation: () => savedRecommendation,
  };
}

test("returns 401 if session is missing", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", {
    method: "POST",
    body: JSON.stringify({ requestText: "hello" }),
  });
  const deps = buildFakeDeps({ session: null });
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 401);
});

test("returns 400 on empty request", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST" });
  const deps = buildFakeDeps();
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 400);
});

test("returns 400 on malformed json body", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: "{bad json}" });
  const deps = buildFakeDeps();
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 400);
});

test("handles extraction failure", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: JSON.stringify({ requestText: "hello" }) });
  const deps = buildFakeDeps({ failsExtraction: true });
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, "EXTRACTION_FAILED");
});

test("handles empty catalog", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: JSON.stringify({ requestText: "hello" }) });
  const deps = buildFakeDeps({ catalog: { products: [] } });
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 503);
});

test("valid recommendation pipeline, deterministic ranking, payload validation", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: JSON.stringify({ requestText: "I want strong bass" }) });
  const deps = buildFakeDeps({ prefs: { budgetPaise: 4000n, weights: { BASS: 100 } } });
  
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 201);
  const json = await res.json();

  assert.equal(json.recommendationId, "rec-123");
  assert.equal(json.results.length, 1, "Only ITEM-1 should match the 4000n budget");
  assert.equal(json.results[0].sku, "ITEM-1");

  const saved = deps.getSavedRecommendation();
  assert.equal(saved.data.sessionId, "test-session-123");
  assert.equal(saved.data.requestSnapshot.text, "I want strong bass");
  assert.equal(saved.data.candidates.length, 3, "Candidates should capture the full snapshot of eligible products");
  assert.equal(saved.data.rankedResults.length, 1);
});

test("no-budget requests return all matching items ordered deterministically", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: JSON.stringify({ requestText: "noise cancellation" }) });
  const deps = buildFakeDeps({ prefs: { budgetPaise: null, weights: { ANC_LEVEL: 100 } } });
  
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 201);
  const json = await res.json();

  assert.equal(json.results.length, 3);
  assert.equal(json.results[0].sku, "ITEM-3", "Highest ANC_LEVEL should be first");
  assert.equal(json.results[1].sku, "ITEM-2");
  assert.equal(json.results[2].sku, "ITEM-1");
});

test("zero matching products due to budget", async () => {
  const req = new Request("http://localhost/api/buyer/recommend", { method: "POST", body: JSON.stringify({ requestText: "hello" }) });
  const deps = buildFakeDeps({ prefs: { budgetPaise: 10n, weights: { BASS: 100 } } });
  
  const res = await handleRecommendation(req, deps.getSession, deps.extractPrefs, deps.getCatalog, deps.saveRecommendation);
  assert.equal(res.status, 201);
  const json = await res.json();

  assert.equal(json.results.length, 0, "No items fit the budget");
  const saved = deps.getSavedRecommendation();
  assert.equal(saved.data.rankedResults.length, 0);
});
