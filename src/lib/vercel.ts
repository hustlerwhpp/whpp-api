import type { ClientsMap } from "./clients";
import { parseClientsMap } from "./clients";

/**
 * Клиент API Vercel: админка правит CLIENTS_MAP и запускает редеплой,
 * поэтому Kevin не правит код и не жмёт Deploy вручную.
 *
 * Нужные env (ставятся один раз в Vercel):
 *   VERCEL_TOKEN       — токен аккаунта (Full Account), только серверная env
 *   VERCEL_PROJECT_ID  — id проекта whpp-api (Settings → General)
 *   VERCEL_TEAM_ID     — опционально, если проект в команде
 *   VERCEL_DEPLOY_HOOK_URL — опционально, хук деплоя вместо API деплоя
 *   VERCEL_API_BASE_URL    — опционально, для локальных тестов (заглушка)
 */

export interface DeploymentInfo {
  id: string;
  url: string | null;
  state: string | null;
}

function vercelBase(): string {
  return (process.env.VERCEL_API_BASE_URL || "https://api.vercel.com").replace(/\/+$/, "");
}

function projectId(): string {
  const id = process.env.VERCEL_PROJECT_ID?.trim();
  if (!id) throw new Error("VERCEL_PROJECT_ID не настроен");
  return id;
}

function teamQuery(): string {
  const team = process.env.VERCEL_TEAM_ID?.trim();
  return team ? `teamId=${encodeURIComponent(team)}` : "";
}

function envQuery(decrypt: boolean, upsert = false): string {
  const params = new URLSearchParams();
  if (decrypt) params.set("decrypt", "true");
  if (upsert) params.set("upsert", "true");
  const team = process.env.VERCEL_TEAM_ID?.trim();
  if (team) params.set("teamId", team);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function vercelFetch(path: string, init?: RequestInit): Promise<unknown> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error("VERCEL_TOKEN не настроен");

  const response = await fetch(`${vercelBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : `Vercel API ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

interface EnvVar {
  id: string;
  key: string;
  value: string;
  target?: string[];
  type?: string;
}

async function listEnvVars(): Promise<EnvVar[]> {
  // decrypt=true обязателен: CLIENTS_MAP хранится как encrypted, и без него
  // API отдаёт шифротекст вместо JSON, а админка видела бы пустой список.
  const data = (await vercelFetch(
    `/v10/projects/${projectId()}/env${envQuery(true)}`
  )) as { envs?: EnvVar[] };
  return Array.isArray(data?.envs) ? data.envs : [];
}

/**
 * Актуальная карта клиентов из env Vercel (а не из process.env запущенного
 * деплоя). Важна, пока идёт редеплой: иначе два создания подряд до редеплоя
 * не увидят друг друга и пропустят дубликат orderCode, а удаление затрёт
 * только что созданного клиента. При недоступности API возвращает null —
 * вызывающий код откатывается на process.env.
 */
export async function getClientsMapFromVercel(): Promise<ClientsMap | null> {
  try {
    const vars = await listEnvVars();
    const found = vars.find((v) => v.key === "CLIENTS_MAP");
    if (!found) return null;
    // Значение может быть нечитаемым (шифротекст без decrypt) — тогда null,
    // и вызывающий код откатится на process.env запущенного деплоя,
    // а не покажет пустой список.
    try {
      JSON.parse(found.value);
    } catch {
      console.error("getClientsMapFromVercel: значение CLIENTS_MAP не JSON");
      return null;
    }
    return parseClientsMap(found.value);
  } catch (error) {
    console.error("getClientsMapFromVercel error:", error);
    return null;
  }
}

/**
 * Перезаписывает CLIENTS_MAP в env проекта. Ручное редактирование не нужно.
 * Использует upsert вместо DELETE+POST: удаление с последующим созданием
 * оставляло окно, в котором переменной нет вовсе, и при ошибке создания
 * карта терялась (живой случай 2026-11-16: DELETE прошёл, POST — нет).
 */
export async function updateClientsMapEnv(map: ClientsMap): Promise<void> {
  const value = JSON.stringify(map);
  const existing = (await listEnvVars()).find((v) => v.key === "CLIENTS_MAP");
  const target = existing?.target && existing.target.length > 0 ? existing.target : ["production", "preview"];
  // Тип сохраняем как был (encrypted для секретов): админка читает значение
  // обратно через decrypt=true, а в дашборде оно скрыто.
  const type = existing?.type || "encrypted";

  await vercelFetch(`/v10/projects/${projectId()}/env${envQuery(false, true)}`, {
    method: "POST",
    body: JSON.stringify({ key: "CLIENTS_MAP", value, type, target }),
  });
}

/** Запускает редеплой production. Возвращает id деплоя для отслеживания статуса. */
export async function triggerRedeploy(): Promise<DeploymentInfo> {
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (hookUrl) {
    const res = await fetch(hookUrl, { method: "POST", cache: "no-store" });
    if (!res.ok) throw new Error(`Deploy hook вернул ${res.status}`);
    const data = (await res.json().catch(() => null)) as { job?: { id?: string } } | null;
    return { id: data?.job?.id || "hook", url: null, state: "BUILDING" };
  }

  const project = (await vercelFetch(
    `/v9/projects/${projectId()}${teamQuery()}`
  )) as { id?: string; name?: string; link?: { repoId?: number } };
  const repoId = project?.link?.repoId;
  if (!repoId) {
    throw new Error(
      "У проекта нет привязки к GitHub (link.repoId), задайте VERCEL_DEPLOY_HOOK_URL"
    );
  }

  const deployment = (await vercelFetch(`/v13/deployments${teamQuery()}`, {
    method: "POST",
    body: JSON.stringify({
      name: project.name || "whpp-api",
      project: project.id || projectId(),
      target: "production",
      gitSource: { type: "github", repoId, ref: "main" },
    }),
  })) as { id?: string; url?: string; readyState?: string };

  if (!deployment?.id) throw new Error("Vercel не вернул id деплоя");
  return { id: deployment.id, url: deployment.url || null, state: deployment.readyState || "BUILDING" };
}

export async function getDeploymentStatus(id: string): Promise<DeploymentInfo> {
  if (id === "hook") return { id, url: null, state: "UNKNOWN" };
  const deployment = (await vercelFetch(
    `/v13/deployments/${id}${teamQuery()}`
  )) as { id?: string; url?: string; readyState?: string; state?: string };
  return {
    id: deployment.id || id,
    url: deployment.url || null,
    state: deployment.readyState || deployment.state || "UNKNOWN",
  };
}
