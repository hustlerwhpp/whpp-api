import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAccessCode, getClientsMap, type ClientsMap } from "@/lib/clients";
import { triggerRedeploy, updateClientsMapEnv, getClientsMapFromVercel } from "@/lib/vercel";

export const dynamic = "force-dynamic";

function cabinetUrl(request: NextRequest, code: string): string {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || "api.whpp.site";
  return `${proto}://${host}/?code=${encodeURIComponent(code)}`;
}

/** DELETE /api/admin/clients/<код> — удалить клиента и редеплоить. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  const map: ClientsMap = (await getClientsMapFromVercel()) ?? getClientsMap();
  const code = decodeURIComponent(params.code);
  if (!map[code]) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const nextMap: ClientsMap = { ...map };
  delete nextMap[code];

  try {
    await updateClientsMapEnv(nextMap);
  } catch (error) {
    console.error("updateClientsMapEnv error:", error);
    return NextResponse.json(
      {
        error: "Не удалось сохранить изменения в Vercel",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }

  let deployment = null;
  let deployError: string | null = null;
  try {
    deployment = await triggerRedeploy();
  } catch (error) {
    console.error("triggerRedeploy error:", error);
    deployError = "Клиент удалён, но редеплой не запустился — запустите его кнопкой «Редеплой»";
  }

  return NextResponse.json({ ok: true, deployment, deployError });
}

/**
 * POST /api/admin/clients/<код> { action: "regenerate" } —
 * выдать клиенту новый код доступа (старый сразу перестаёт работать).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
  if (body?.action !== "regenerate") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  const map: ClientsMap = (await getClientsMapFromVercel()) ?? getClientsMap();
  const oldCode = decodeURIComponent(params.code);
  const client = map[oldCode];
  if (!client) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const nextMap: ClientsMap = { ...map };
  delete nextMap[oldCode];
  const accessCode = generateAccessCode(nextMap);
  nextMap[accessCode] = client;

  try {
    await updateClientsMapEnv(nextMap);
  } catch (error) {
    console.error("updateClientsMapEnv error:", error);
    return NextResponse.json(
      {
        error: "Не удалось сохранить изменения в Vercel",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }

  let deployment = null;
  let deployError: string | null = null;
  try {
    deployment = await triggerRedeploy();
  } catch (error) {
    console.error("triggerRedeploy error:", error);
    deployError = "Код сменён, но редеплой не запустился — запустите его кнопкой «Редеплой»";
  }

  return NextResponse.json({
    client: { accessCode, name: client.name, orderCode: client.orderCode, cabinetUrl: cabinetUrl(request, accessCode) },
    deployment,
    deployError,
  });
}
