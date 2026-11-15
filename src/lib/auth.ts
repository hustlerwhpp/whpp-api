import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "whpp_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 дней

export type SessionRole = "admin" | "client";

export interface Session {
  role: SessionRole;
  /** Код доступа клиента (только для роли client). */
  code?: string;
  exp: number;
}

function signingKey(): Buffer {
  // Ключ подписи сессий выводится из пароля админа: отдельный секрет не нужен,
  // а подделать сессию без пароля нельзя. Пароль в env нигде не светится.
  return crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD || "").digest();
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !input) return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function signSession(session: Session): string {
  const payload = b64url(JSON.stringify(session));
  const sig = crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (
      (session.role !== "admin" && session.role !== "client") ||
      typeof session.exp !== "number" ||
      session.exp * 1000 < Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function createSession(role: SessionRole, code?: string): string {
  return signSession({
    role,
    code,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

export function getSession(request: NextRequest): Session | null {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/** Возвращает 401-ответ, если сессии админа нет, иначе саму сессию. */
export function requireAdmin(
  request: NextRequest
): { session: Session } | { response: NextResponse } {
  const session = getSession(request);
  if (!session || session.role !== "admin") {
    return {
      response: NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 }),
    };
  }
  return { session };
}
