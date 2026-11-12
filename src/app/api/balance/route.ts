import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessCode = body.accessCode?.trim();

    if (!accessCode) {
      return NextResponse.json(
        { error: 'Неверный код доступа' },
        { status: 401 }
      );
    }

    // Парсим CLIENTS_MAP из переменных окружения
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

    // Ищем клиента по accessCode
    const client = clientsMap[accessCode];
    if (!client) {
      return NextResponse.json(
        { error: 'Неверный код доступа' },
        { status: 401 }
      );
    }

    // Делаем запрос к upstream API
    const upstreamUrl = process.env.UPSTREAM_API_URL;
    if (!upstreamUrl) {
      console.error('UPSTREAM_API_URL не настроен');
      return NextResponse.json(
        { error: 'Не удалось получить баланс, попробуйте позже' },
        { status: 502 }
      );
    }

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
      
      // Берём только balance.token_balance
      const tokenBalance = data?.balance?.token_balance;
      if (typeof tokenBalance !== 'number') {
        console.error('Неверный формат ответа upstream:', data);
        return NextResponse.json(
          { error: 'Не удалось получить баланс, попробуйте позже' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        clientName: client.name,
        tokenBalance,
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