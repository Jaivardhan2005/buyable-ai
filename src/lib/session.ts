import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "buyer_session_token";
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateSessionToken() {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
