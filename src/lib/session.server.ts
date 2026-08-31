import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "../../generated/prisma";
import {
  generateSessionToken,
  hashToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "./session";

// In-memory fallback session store for resilience when DB connection is unavailable
const memorySessionStore = new Map<
  string,
  {
    id: string;
    merchantId: string;
    tokenHash: string;
    status: SessionStatus;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }
>();

export async function createBuyerSession(merchantId: string) {
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  try {
    const session = await prisma.customerSession.create({
      data: {
        merchantId,
        tokenHash,
        status: SessionStatus.ACTIVE,
        expiresAt,
      },
    });

    return { session, rawToken };
  } catch (err) {
    console.warn("DB session creation failed, using memory session fallback:", err);
    const fallbackSession = {
      id: "session-" + Math.random().toString(36).substring(2, 12),
      merchantId,
      tokenHash,
      status: SessionStatus.ACTIVE,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memorySessionStore.set(tokenHash, fallbackSession);
    return { session: fallbackSession, rawToken };
  }
}

export async function getBuyerSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  try {
    const session = await prisma.customerSession.findUnique({
      where: { tokenHash },
    });

    if (session) {
      if (session.status !== SessionStatus.ACTIVE || session.expiresAt.getTime() < Date.now()) {
        return null;
      }
      return session;
    }
  } catch (err) {
    console.warn("DB session lookup failed, checking memory session fallback:", err);
  }

  const memSession = memorySessionStore.get(tokenHash);
  if (memSession) {
    if (memSession.status !== SessionStatus.ACTIVE || memSession.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return memSession;
  }

  return null;
}

export async function setBuyerSessionCookie(rawToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: expiresAt,
    path: "/",
  });
}

export async function getBuyerSessionFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return getBuyerSession(token);
}
