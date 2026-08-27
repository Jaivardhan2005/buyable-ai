import assert from "node:assert/strict";
import test from "node:test";
import { validateExtraction, ExtractionError } from "./llm.server";

test("validates a normal preference request with no budget", () => {
  const input = JSON.stringify({
    budgetPaise: null,
    weights: { ANC_LEVEL: 80, BASS: 60 }
  });
  const result = validateExtraction(input);
  assert.equal(result.budgetPaise, null);
  assert.equal(result.weights.ANC_LEVEL, 80);
  assert.equal(result.weights.BASS, 60);
});

test("validates an explicit budget such as ₹18,000", () => {
  const input = JSON.stringify({
    budgetPaise: 1800000,
    weights: { COMFORT: 90 }
  });
  const result = validateExtraction(input);
  assert.equal(result.budgetPaise, 1800000n);
  assert.equal(result.weights.COMFORT, 90);
});

test("preserves an explicit budget even if it is very low", () => {
  const input = JSON.stringify({
    budgetPaise: 100000, // ₹1,000
    weights: { BATTERY_HOURS: 50 }
  });
  const result = validateExtraction(input);
  assert.equal(result.budgetPaise, 100000n);
});

test("validates multiple preference requirements", () => {
  const input = JSON.stringify({
    budgetPaise: null,
    weights: { ANC_LEVEL: 100, BASS: 90, COMFORT: 80, MICROPHONE: 70 }
  });
  const result = validateExtraction(input);
  assert.deepEqual(result.weights, { ANC_LEVEL: 100, BASS: 90, COMFORT: 80, MICROPHONE: 70 });
});

test("validates with no recognizable preferences (empty weights)", () => {
  const input = JSON.stringify({
    budgetPaise: null,
    weights: {}
  });
  const result = validateExtraction(input);
  assert.deepEqual(result.weights, {});
});

test("throws on malformed JSON output", () => {
  assert.throws(() => validateExtraction("{ invalid json }"), ExtractionError);
});

test("throws on missing weights field", () => {
  const input = JSON.stringify({ budgetPaise: 100000 });
  assert.throws(() => validateExtraction(input), ExtractionError);
});

test("clamps weight below 0 to 0", () => {
  const input = JSON.stringify({
    weights: { BASS: -10 }
  });
  const result = validateExtraction(input);
  assert.equal(result.weights.BASS, 0);
});

test("clamps weight above 100 to 100", () => {
  const input = JSON.stringify({
    weights: { ANC_LEVEL: 150 }
  });
  const result = validateExtraction(input);
  assert.equal(result.weights.ANC_LEVEL, 100);
});

test("throws on invalid/non-positive budget", () => {
  const inputZero = JSON.stringify({ budgetPaise: 0, weights: {} });
  assert.throws(() => validateExtraction(inputZero), ExtractionError);

  const inputNegative = JSON.stringify({ budgetPaise: -1000, weights: {} });
  assert.throws(() => validateExtraction(inputNegative), ExtractionError);

  const inputFloat = JSON.stringify({ budgetPaise: 1000.5, weights: {} });
  assert.throws(() => validateExtraction(inputFloat), ExtractionError);
});

test("ignores unexpected extra fields", () => {
  const input = JSON.stringify({
    budgetPaise: null,
    weights: { BASS: 50, FAKE_FIELD: 99 },
    extraData: "should be ignored"
  });
  const result = validateExtraction(input);
  assert.equal(result.budgetPaise, null);
  assert.equal(result.weights.BASS, 50);
  assert.equal((result.weights as any).FAKE_FIELD, undefined);
});
