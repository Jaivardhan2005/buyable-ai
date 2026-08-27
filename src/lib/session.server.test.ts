import assert from "node:assert/strict";
import test from "node:test";
import { generateSessionToken, hashToken, SESSION_DURATION_MS } from "./session";

test("secure token generation returns 32-byte hex and correct hash", () => {
  const { rawToken, tokenHash } = generateSessionToken();

  assert.equal(rawToken.length, 64, "Raw token should be 64 characters (32 bytes hex)");
  assert.match(rawToken, /^[0-9a-f]{64}$/, "Raw token should be valid hex");

  assert.equal(tokenHash.length, 64, "Token hash should be 64 characters (SHA-256 hex)");
  assert.match(tokenHash, /^[0-9a-f]{64}$/, "Token hash should be valid hex");

  // Verify deterministic hashing
  const expectedHash = hashToken(rawToken);
  assert.equal(tokenHash, expectedHash, "Token hash should match the hashed raw token");
});

test("deterministic hashing is stable for known inputs", () => {
  const knownInput = "a".repeat(64);
  const hash1 = hashToken(knownInput);
  const hash2 = hashToken(knownInput);

  assert.equal(hash1, hash2, "Hashing the same input should yield the same output");
  assert.notEqual(knownInput, hash1, "Hash should not equal raw input");
});

test("SESSION_DURATION_MS is exactly 24 hours", () => {
  assert.equal(SESSION_DURATION_MS, 24 * 60 * 60 * 1000);
});
