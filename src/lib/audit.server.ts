import { randomUUID } from "crypto";
import { prisma, withDb } from "@/lib/prisma";
import { ActorType, Prisma, AuditEvent } from "../../generated/prisma";

export type RecordAuditEventInput = {
  correlationId?: string;
  merchantId?: string;
  sessionId?: string;
  transactionId?: string;
  actorType: ActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: "SUCCESS" | "BLOCKED" | "FAILED";
  reason: string;
  metadata?: Record<string, unknown>;
};

// In-memory store for audit trail inspection and test resilience
const memoryAuditLog: AuditEvent[] = [];

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<AuditEvent> {
  const correlationId = input.correlationId || randomUUID();
  const id = randomUUID();
  const metadata = (input.metadata || {}) as Prisma.JsonValue;

  const eventRecord: AuditEvent = {
    id,
    correlationId,
    merchantId: input.merchantId ?? null,
    sessionId: input.sessionId ?? null,
    transactionId: input.transactionId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: input.outcome,
    reason: input.reason,
    metadata,
    createdAt: new Date(),
  };

  memoryAuditLog.push(eventRecord);

  return withDb(
    () =>
      prisma.auditEvent.create({
        data: {
          id,
          correlationId,
          merchantId: input.merchantId,
          sessionId: input.sessionId,
          transactionId: input.transactionId,
          actorType: input.actorType,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          outcome: input.outcome,
          reason: input.reason,
          metadata: (input.metadata || {}) as Prisma.InputJsonValue,
        },
      }),
    () => eventRecord
  );
}

export function getMemoryAuditEvents(filter?: {
  sessionId?: string;
  transactionId?: string;
  action?: string;
}): AuditEvent[] {
  return memoryAuditLog.filter((event) => {
    if (filter?.sessionId && event.sessionId !== filter.sessionId) return false;
    if (filter?.transactionId && event.transactionId !== filter.transactionId) return false;
    if (filter?.action && event.action !== filter.action) return false;
    return true;
  });
}
