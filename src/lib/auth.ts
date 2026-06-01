import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getRequiredEnv } from "@/lib/env";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "bank_session";

type SessionPayload = {
  sub: string;
  role: UserRole;
  email: string;
};

function getSessionSecret() {
  return new TextEncoder().encode(getRequiredEnv("SESSION_SECRET"));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSessionSecret());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getSessionSecret());
    return verified.payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }
  return session;
}

export async function getCurrentUserProfile() {
  const session = await requireSession();
  return prisma.user.findUnique({
    where: { id: session.sub },
    include: {
      customer: {
        include: {
          accounts: true
        }
      }
    }
  });
}
