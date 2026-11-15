export interface UpstreamLog {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costTokens: number;
  latencyMs: number;
  status: "success" | "error";
  createdAt: string;
}

export interface UpstreamClientData {
  apiKey: string | null;
  tokenBalance: number;
  tokenLimit: number | null;
  usedTokens: number | null;
  createdAt: string | null;
  totalLogs: number;
  spentFromLogs: number | null;
  models: string[];
  logs: UpstreamLog[];
}

interface RawUpstreamLog {
  model?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cached_tokens?: unknown;
  cost_tokens?: unknown;
  latency_ms?: unknown;
  status?: unknown;
  created_at?: unknown;
}

/** Данные одного клиента из upstream (triklz) по его коду заказа. */
export async function fetchUpstreamClientData(orderCode: string): Promise<UpstreamClientData> {
  const rawUpstreamUrl = process.env.UPSTREAM_API_URL?.trim();
  if (!rawUpstreamUrl) {
    throw new Error("UPSTREAM_API_URL не настроен");
  }

  const upstreamUrl = rawUpstreamUrl.endsWith("/api/activate")
    ? rawUpstreamUrl
    : `${rawUpstreamUrl.replace(/\/+$/, "")}/api/activate`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: orderCode }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }

    const data = await response.json();
    const tokenBalance = data?.balance?.token_balance;
    if (typeof tokenBalance !== "number") {
      throw new Error("Неверный формат ответа upstream");
    }

    const tokenLimit =
      typeof data?.tokenLimit === "number" && data.tokenLimit > 0 ? data.tokenLimit : null;

    const models = Array.isArray(data?.models)
      ? data.models.filter((m: unknown): m is string => typeof m === "string")
      : [];

    const safeLogs = Array.isArray(data?.logs)
      ? (data.logs as RawUpstreamLog[]).slice(0, 50).map((log) => ({
          model: typeof log.model === "string" ? log.model : "unknown",
          inputTokens: typeof log.input_tokens === "number" ? log.input_tokens : 0,
          outputTokens: typeof log.output_tokens === "number" ? log.output_tokens : 0,
          cachedTokens: typeof log.cached_tokens === "number" ? log.cached_tokens : 0,
          costTokens: typeof log.cost_tokens === "number" ? log.cost_tokens : 0,
          latencyMs: typeof log.latency_ms === "number" ? log.latency_ms : 0,
          status: log.status === "success" ? ("success" as const) : ("error" as const),
          createdAt: typeof log.created_at === "string" ? log.created_at : "",
        }))
      : [];

    return {
      apiKey: typeof data?.key === "string" ? data.key : null,
      tokenBalance,
      tokenLimit,
      usedTokens: tokenLimit !== null ? Math.max(0, tokenLimit - tokenBalance) : null,
      createdAt: typeof data?.createdAt === "string" ? data.createdAt : null,
      totalLogs: typeof data?.totalLogs === "number" ? data.totalLogs : safeLogs.length,
      spentFromLogs: typeof data?.spentFromLogs === "number" ? data.spentFromLogs : null,
      models,
      logs: safeLogs,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getProxyBase(): string {
  return (
    process.env.PROXY_BASE_URL || "https://raspy-smoke-dac3.gkk08k.workers.dev"
  ).replace(/\/+$/, "");
}
