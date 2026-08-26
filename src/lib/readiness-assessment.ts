import { createHash } from "node:crypto";

import type { Prisma } from "../../generated/prisma";
import type { MerchantReadiness, ReadinessMerchantSnapshot } from "@/lib/readiness";

export const READINESS_RUBRIC_VERSION = "day-2-v1";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

export type ReadinessSnapshots = {
  catalog: CanonicalValue;
  policy: CanonicalValue;
  catalogSnapshotHash: string;
  policySnapshotHash: string;
};

export type ReadinessAssessmentWrite = {
  merchantId: string;
  score: number;
  rubricVersion: string;
  catalogSnapshotHash: string;
  policySnapshotHash: string;
  status: "COMPLETED";
  issues: {
    code: string;
    severity: "INFO" | "WARNING" | "BLOCKER";
    title: string;
    evidence: Prisma.InputJsonValue;
    evidenceHash: string;
    safeFix?: Prisma.InputJsonValue;
  }[];
};

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  throw new Error(`Cannot canonicalize ${typeof value} in a readiness snapshot`);
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function createReadinessSnapshots(snapshot: ReadinessMerchantSnapshot): ReadinessSnapshots {
  const catalog = {
    merchant: { id: snapshot.id, status: snapshot.status },
    products: [...snapshot.products].sort((left, right) => left.sku.localeCompare(right.sku) || left.id.localeCompare(right.id)).map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      description: product.description,
      pricePaise: product.pricePaise.toString(),
      currency: product.currency,
      status: product.status,
      inventory: product.inventory && { availableQty: product.inventory.availableQty, reservedQty: product.inventory.reservedQty, updatedAt: product.inventory.updatedAt.toISOString() },
      attributes: [...product.attributes].sort((left, right) => left.key.localeCompare(right.key)).map((attribute) => ({ key: attribute.key, normalizedScore: attribute.normalizedScore })),
    })),
  };
  const policy = {
    merchantId: snapshot.id,
    policies: [...snapshot.policies].sort((left, right) => left.policyType.localeCompare(right.policyType) || left.id.localeCompare(right.id)).map((policyItem) => ({ id: policyItem.id, policyType: policyItem.policyType, content: policyItem.content, structuredRules: policyItem.structuredRules })),
  };

  return { catalog: canonicalize(catalog), policy: canonicalize(policy), catalogSnapshotHash: sha256(catalog), policySnapshotHash: sha256(policy) };
}

export function createReadinessAssessmentWrite(readiness: MerchantReadiness, snapshots: ReadinessSnapshots): ReadinessAssessmentWrite {
  return {
    merchantId: readiness.merchantId,
    score: readiness.score,
    rubricVersion: READINESS_RUBRIC_VERSION,
    catalogSnapshotHash: snapshots.catalogSnapshotHash,
    policySnapshotHash: snapshots.policySnapshotHash,
    status: "COMPLETED",
    issues: readiness.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      title: issue.title,
      evidence: canonicalize(issue.evidence) as Prisma.InputJsonValue,
      evidenceHash: sha256(issue.evidence),
      ...(issue.safeFix ? { safeFix: canonicalize(issue.safeFix) as Prisma.InputJsonValue } : {}),
    })),
  };
}
