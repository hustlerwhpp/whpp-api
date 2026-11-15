import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { triggerRedeploy } from "@/lib/vercel";

export const dynamic = "force-dynamic";

/** POST — вручную запустить редеплой (если авторедеплой при создании не сработал). */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const deployment = await triggerRedeploy();
    return NextResponse.json({ deployment });
  } catch (error) {
    console.error("triggerRedeploy error:", error);
    return NextResponse.json(
      { error: "Не удалось запустить редеплой, проверьте VERCEL_TOKEN / VERCEL_DEPLOY_HOOK_URL" },
      { status: 502 }
    );
  }
}
