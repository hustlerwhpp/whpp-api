import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAccessCode, getClientsMap, type ClientsMap } from "@/lib/clients";
import { fetchUpstreamClientData } from "@/lib/upstream";
import { triggerRedeploy, updateClientsMapEnv, getClientsMapFromVercel, type DeploymentInfo } from "@/lib/vercel";

export const dynamic = "force-dynamic";

export interface AdminClientView {
  accessCode: string;
  name: string;
  orderCode: string;
  tokenBalance: number | null;
  tokenLimit: number | null;
  usedTokens: number | null;
  createdAt: string | null;
  totalLogs: number | null;
  error?: string;
}

function cabinetUrl(request: NextRequest, code: string): string {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || "api.whpp.site";
  return `${proto}://${host}/?code=${encodeURIComponent(code)}`;
}

/** GET — список всех клиентов с живым балансом (только админ). */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  const map = (await getClientsMapFromVercel()) ?? getClientsMap();
  const entries = Object.entries(map);

  const settled = await Promise.allSettled(
    entries.map(async ([accessCode, client]): Promise<AdminClientView> => {
      try {
        const data = await fetchUpstreamClientData(client.orderCode);
        return {
          accessCode,
          name: client.name,
          orderCode: client.orderCode,
          tokenBalance: data.tokenBalance,
          tokenLimit: data.tokenLimit,
          usedTokens: data.usedTokens,
          createdAt: data.createdAt,
          totalLogs: data.totalLogs,
        };
      } catch {
        return {
          accessCode,
          name: client.name,
          orderCode: client.orderCode,
          tokenBalance: null,
          tokenLimit: null,
          usedTokens: null,
          createdAt: null,
          totalLogs: null,
          error: "Upstream недоступен",
        };
      }
    })
  );

  const clients = settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          accessCode: "?",
          name: "?",
          orderCode: "",
          tokenBalance: null,
          tokenLimit: null,
          usedTokens: null,
          createdAt: null,
          totalLogs: null,
          error: "Ошибка",
        }
  );

  return NextResponse.json({ clients, updatedAt: new Date().toISOString() });
}

/**
 * POST — создать клиента. Тело: { name, orderCode }.
 * Пишет новый CLIENTS_MAP в env Vercel и запускает редеплой — код
 * и редеплой руками не трогаются. Ссылка на кабинет заработает,
 * когда редеплой дойдёт до READY (~минута).
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  let body: { name?: unknown; orderCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const orderCode = typeof body?.orderCode === "string" ? body.orderCode.trim() : "";
  if (!name || !orderCode) {
    return NextResponse.json(
      { error: "Нужны имя и код заказа" },
      { status: 400 }
    );
  }

  const map: ClientsMap = (await getClientsMapFromVercel()) ?? getClientsMap();
  if (Object.values(map).some((c) => c.orderCode === orderCode)) {
    return NextResponse.json(
      { error: "Клиент с таким кодом заказа уже есть" },
      { status: 409 }
    );
  }

  const accessCode = generateAccessCode(map);
  const nextMap: ClientsMap = { ...map, [accessCode]: { name, orderCode } };

  try {
    await updateClientsMapEnv(nextMap);
  } catch (error) {
    console.error("updateClientsMapEnv error:", error);
    return NextResponse.json(
      { error: "Не удалось сохранить клиента в Vercel, проверьте VERCEL_TOKEN" },
      { status: 502 }
    );
  }

  let deployment: DeploymentInfo | null = null;
  let deployError: string | null = null;
  try {
    deployment = await triggerRedeploy();
  } catch (error) {
    console.error("triggerRedeploy error:", error);
    deployError = "Клиент сохранён, но редеплой не запустился — запустите его кнопкой «Редеплой»";
  }

  return NextResponse.json(
    {
      client: {
        accessCode,
        name,
        orderCode,
        cabinetUrl: cabinetUrl(request, accessCode),
      },
      deployment,
      deployError,
    },
    { status: 201 }
  );
}
