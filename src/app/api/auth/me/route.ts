import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientsMap } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Нет сессии" }, { status: 401 });
  }
  if (session.role === "admin") {
    return NextResponse.json({ role: "admin" });
  }
  const client = session.code ? getClientsMap()[session.code] : undefined;
  if (!client) {
    return NextResponse.json({ error: "Аккаунт не найден" }, { status: 401 });
  }
  return NextResponse.json({ role: "client", code: session.code, clientName: client.name });
}
