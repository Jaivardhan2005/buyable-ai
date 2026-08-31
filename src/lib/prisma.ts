import { PrismaClient } from "../../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let dbUnavailableUntil = 0;

export async function withDb<T>(
  queryFn: () => Promise<T>,
  fallbackFn: () => Promise<T> | T,
  timeoutMs = 400
): Promise<T> {
  const now = Date.now();
  if (now < dbUnavailableUntil) {
    return typeof fallbackFn === "function" ? fallbackFn() : fallbackFn;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB_TIMEOUT")), timeoutMs)
    );
    const result = await Promise.race([queryFn(), timeoutPromise]);
    return result;
  } catch {
    // Flag DB connection unavailable for 10 seconds to avoid repeating TCP connection timeouts
    dbUnavailableUntil = Date.now() + 10000;
    return typeof fallbackFn === "function" ? fallbackFn() : fallbackFn;
  }
}
