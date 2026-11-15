import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDeploymentStatus } from "@/lib/vercel";

export const dynamic = "force-dynamic";

/** GET — статус деплоя для отслеживания редеплоя после создания клиента. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const deployment = await getDeploymentStatus(decodeURIComponent(params.id));
    return NextResponse.json({ deployment });
  } catch (error) {
    console.error("getDeploymentStatus error:", error);
    return NextResponse.json(
      { error: "Не удалось узнать статус деплоя" },
      { status: 502 }
    );
  }
}
