import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface UpstreamLog {
  model?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cached_tokens?: unknown;
  cost_tokens?: unknown;
  latency_ms?: unknown;
  status?: unknown;
  created_at?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';

    if (!accessCode) {
      return NextResponse.json(
        { error: 'Неверный код доступа' },
        { status: 401 }
      );
    }

    const clientsMapJson = process.env.CLIENTS_MAP;
    if (!clientsMapJson) {
      console.error('CLIENTS_MAP не настроен');
      return NextResponse.json(
        { error: 'Не удалось получить баланс, попробуйте позже' },
        { status: 502 }
      );
    }

    let clientsMap: Record<string, { name: string; orderCode: string }>;
    try {
      clientsMap = JSON.parse(clientsMapJson);
    } catch (e) {
      console.error('Ошибка парсинга CLIENTS_MAP:', e);
      return NextResponse.json(
        { error: 'Не удалось получить баланс, попробуйте позже' },
        { status: 502 }
      );
    }

    const client = clientsMap[accessCode];
    if (!client || !client.orderCode) {
      return NextResponse.json(
        { error: 'Неверный код доступа' },
        { status: 401 }
      );
    }

    const rawUpstreamUrl = process.env.UPSTREAM_API_URL?.trim();
    if (!rawUpstreamUrl) {
      console.error('UPSTREAM_API_URL не настроен');
      return NextResponse.json(
        { error: 'Не удалось получить баланс, попробуйте позже' },
        { status: 502 }
      );
    }

    const upstreamUrl = rawUpstreamUrl.endsWith('/api/activate')
      ? rawUpstreamUrl
      : `${rawUpstreamUrl.replace(/\/+$/, '')}/api/activate`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: client.orderCode }),
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('Upstream API error:', response.status, response.statusText);
        return NextResponse.json(
          { error: 'Не удалось получить баланс, попробуйте позже' },
          { status: 502 }
        );
      }

      const data = await response.json();

      const tokenBalance = data?.balance?.token_balance;
      if (typeof tokenBalance !== 'number') {
        console.error('Неверный формат ответа upstream');
        return NextResponse.json(
          { error: 'Не удалось получить баланс, попробуйте позже' },
          { status: 502 }
        );
      }

      const tokenLimit =
        typeof data?.tokenLimit === 'number' && data.tokenLimit > 0
          ? data.tokenLimit
          : null;

      const usedTokens =
        tokenLimit !== null ? Math.max(0, tokenLimit - tokenBalance) : null;

      const models = Array.isArray(data?.models)
        ? data.models.filter((m: unknown): m is string => typeof m === 'string')
        : [];

      // Отбрасываем apiBase, requestId, portal, warnings и error_message
      const safeLogs = Array.isArray(data?.logs)
        ? (data.logs as UpstreamLog[])
            .slice(0, 50)
            .map((log) => ({
              model: typeof log.model === 'string' ? log.model : 'unknown',
              inputTokens: typeof log.input_tokens === 'number' ? log.input_tokens : 0,
              outputTokens: typeof log.output_tokens === 'number' ? log.output_tokens : 0,
              cachedTokens: typeof log.cached_tokens === 'number' ? log.cached_tokens : 0,
              costTokens: typeof log.cost_tokens === 'number' ? log.cost_tokens : 0,
              latencyMs: typeof log.latency_ms === 'number' ? log.latency_ms : 0,
              status: log.status === 'success' ? 'success' : 'error',
              createdAt: typeof log.created_at === 'string' ? log.created_at : '',
            }))
        : [];

      const proxyBase = (
        process.env.PROXY_BASE_URL || 'https://raspy-smoke-dac3.gkk08k.workers.dev'
      ).replace(/\/+$/, '');

      return NextResponse.json({
        clientName: client.name,
        apiKey: typeof data?.key === 'string' ? data.key : null,
        tokenBalance,
        tokenLimit,
        usedTokens,
        createdAt: typeof data?.createdAt === 'string' ? data.createdAt : null,
        totalLogs: typeof data?.totalLogs === 'number' ? data.totalLogs : safeLogs.length,
        spentFromLogs:
          typeof data?.spentFromLogs === 'number' ? data.spentFromLogs : null,
        models,
        logs: safeLogs,
        proxyOpenaiUrl: `${proxyBase}/v1`,
        proxyClaudeUrl: proxyBase,
        updatedAt: new Date().toISOString(),
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Upstream API timeout');
      } else {
        console.error('Upstream API fetch error:', fetchError);
      }
      return NextResponse.json(
        { error: 'Не удалось получить баланс, попробуйте позже' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('API balance error:', error);
    return NextResponse.json(
      { error: 'Не удалось получить баланс, попробуйте позже' },
      { status: 502 }
    );
  }
}