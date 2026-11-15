import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  isAdminConfigured,
  setSessionCookie,
  verifyAdminPassword,
} from "@/lib/auth";
import { getClientsMap } from "@/lib/clients";
import { getClientsMapFromVercel } from "@/lib/vercel";

export const dynamic = "force-dynamic";

// Простой лимит на перебор: 10 неудачных попыток с одного IP за 5 минут.
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= 10;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Слишком много попыток, подождите 5 минут" },
      { status: 429 }
    );
  }

  let body: { password?: unknown; accessCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  // Вход администратора — по паролю из env ADMIN_PASSWORD.
  if (typeof body?.password === "string") {
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: "Админка не настроена" }, { status: 503 });
    }
    if (!verifyAdminPassword(body.password)) {
      recordFailure(ip);
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ role: "admin" });
    setSessionCookie(response, createSession("admin"));
    return response;
  }

  // Вход клиента — по коду доступа. Код знает только сам клиент и админ.
  if (typeof body?.accessCode === "string") {
    const code = body.accessCode.trim();
    const client = code ? getClientsMap()[code] : undefined;
    if (!client) {
      // Код уже сохранён в Vercel, но редеплой ещё не применил его к запущенному
      // деплою: честно говорим, что надо подождать минуту, а не «неверный код».
      if (code) {
        const live = await getClientsMapFromVercel();
        if (live && live[code]) {
          return NextResponse.json(
            { error: "Аккаунт создан, идёт редеплой — попробуйте через минуту" },
            { status: 503 }
          );
        }
      }
      recordFailure(ip);
      return NextResponse.json({ error: "Неверный код доступа" }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ role: "client", clientName: client.name });
    setSessionCookie(response, createSession("client", code));
    return response;
  }

  return NextResponse.json({ error: "Нужен пароль или код доступа" }, { status: 400 });
}
