import "server-only";

import { prisma } from "@/lib/prisma";
import { createReadinessAssessmentWrite, createReadinessSnapshots } from "@/lib/readiness-assessment";
import { evaluateMerchantReadiness } from "@/lib/readiness";
import { loadMerchantReadinessSnapshot } from "@/lib/readiness.server";

/** Creates a new completed assessment and never updates or deletes earlier assessments. */
export async function createMerchantReadinessAssessment(merchantId: string) {
  const merchant = await loadMerchantReadinessSnapshot(merchantId);
  const readiness = evaluateMerchantReadiness(merchant, new Date());
  const write = createReadinessAssessmentWrite(readiness, createReadinessSnapshots(merchant));

  return prisma.$transaction((transaction) => transaction.readinessAssessment.create({
    data: {
      merchantId: write.merchantId,
      score: write.score,
      rubricVersion: write.rubricVersion,
      catalogSnapshotHash: write.catalogSnapshotHash,
      policySnapshotHash: write.policySnapshotHash,
      status: write.status,
      issues: { create: write.issues },
    },
    include: { issues: { orderBy: [{ code: "asc" }, { evidenceHash: "asc" }] } },
  }));
}
