import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientsMap } from "@/lib/clients";
import { fetchUpstreamClientData, getProxyBase } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * GET /api/balance — только по сессии (httpOnly-cookie).
 * Клиент видит только свои данные, админ — любого клиента через ?client=<код>.
 * Код доступа в теле запроса больше не принимается: кто его знает, тот
 * проходит логин и получает сессию, а перебор чужих кодов здесь невозможен.
 */
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  let code: string | undefined;
  if (session.role === "admin") {
    code = request.nextUrl.searchParams.get("client") || undefined;
    if (!code) {
      return NextResponse.json(
        { error: "Админу нужен параметр ?client=<код>" },
        { status: 400 }
      );
    }
  } else {
    code = session.code;
  }

  const client = code ? getClientsMap()[code] : undefined;
  if (!client || !code) {
    return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
  }

  try {
    const data = await fetchUpstreamClientData(client.orderCode);
    const proxyBase = getProxyBase();
    return NextResponse.json({
      clientName: client.name,
      apiKey: data.apiKey,
      tokenBalance: data.tokenBalance,
      tokenLimit: data.tokenLimit,
      usedTokens: data.usedTokens,
      createdAt: data.createdAt,
      totalLogs: data.totalLogs,
      spentFromLogs: data.spentFromLogs,
      models: data.models,
      logs: data.logs,
      proxyOpenaiUrl: `${proxyBase}/v1`,
      proxyClaudeUrl: proxyBase,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Upstream API error:", error);
    return NextResponse.json(
      { error: "Не удалось получить баланс, попробуйте позже" },
      { status: 502 }
    );
  }
}
