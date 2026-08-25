export type MerchantPrincipal = {
  userId: string;
  merchantId: string;
  role: "MERCHANT_ADMIN" | "MERCHANT_EDITOR";
};

/**
 * Day 1 boundary only. Later authentication resolves this principal from the
 * session and merchant membership; route handlers must never accept merchantId
 * from browser input as an authority claim.
 */
export function getMerchantPrincipal(): MerchantPrincipal | null {
  return null;
}
