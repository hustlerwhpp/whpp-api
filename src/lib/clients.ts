import crypto from "crypto";

export interface ClientRecord {
  name: string;
  orderCode: string;
}

export type ClientsMap = Record<string, ClientRecord>;

/**
 * Источник правды о клиентах — переменная окружения CLIENTS_MAP:
 *   { "<код доступа>": { "name": "Имя", "orderCode": "<код заказа triklz>" } }
 * Админка правит её через API Vercel, после чего Vercel делает редеплой
 * и новый состав клиентов вступает в силу. Файловой базы нет специально:
 * на serverless файловая система эфемерна.
 */
export function parseClientsMap(json: string | undefined): ClientsMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: ClientsMap = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        const rec = value as { name?: unknown; orderCode?: unknown };
        if (typeof rec.name === "string" && typeof rec.orderCode === "string") {
          map[code] = { name: rec.name, orderCode: rec.orderCode };
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function getClientsMap(): ClientsMap {
  return parseClientsMap(process.env.CLIENTS_MAP);
}

export function generateAccessCode(existing: ClientsMap): string {
  let code = "";
  do {
    code = crypto.randomBytes(9).toString("base64url");
  } while (existing[code]);
  return code;
}
