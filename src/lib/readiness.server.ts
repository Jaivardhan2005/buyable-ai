import "server-only";

import { type Prisma } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";
import { evaluateMerchantReadiness, type MerchantReadiness } from "@/lib/readiness";

const readinessMerchantInclude = {
  products: { include: { attributes: true, inventory: true } },
  policies: { where: { status: "ACTIVE" } },
  transactions: { include: { paymentEvents: true } },
} satisfies Prisma.MerchantInclude;

export async function loadMerchantReadinessSnapshot(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, include: readinessMerchantInclude });
  if (!merchant) throw new Error(`Merchant ${merchantId} was not found`);

  return merchant;
}

export async function assessMerchantReadiness(merchantId: string): Promise<MerchantReadiness> {
  const merchant = await loadMerchantReadinessSnapshot(merchantId);

  return evaluateMerchantReadiness(merchant, new Date());
}
