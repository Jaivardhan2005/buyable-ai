import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "../../generated/prisma";
import {
  generateSessionToken,
  hashToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "./session";

export async function createBuyerSession(merchantId: string) {
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await prisma.customerSession.create({
    data: {
      merchantId,
      tokenHash,
      status: SessionStatus.ACTIVE,
      expiresAt,
    },
  });

  return { session, rawToken };
}

export async function getBuyerSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash },
  });

  if (!session) {
    return null;
  }

  if (session.status !== SessionStatus.ACTIVE || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return session;
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
