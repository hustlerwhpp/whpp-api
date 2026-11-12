"use client";

import { useState, useEffect, useMemo, FormEvent } from "react";
import "./visual.css";

interface LogEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costTokens: number;
  latencyMs: number;
  status: "success" | "error";
  createdAt: string;
}

interface BalanceData {
  clientName: string;
  tokenBalance: number;
  tokenLimit: number | null;
  usedTokens: number | null;
  createdAt: string | null;
  totalLogs: number;
  spentFromLogs: number | null;
  models: string[];
  logs: LogEntry[];
  proxyOpenaiUrl: string;
  proxyClaudeUrl: string;
  updatedAt: string;
}

type SnippetTab = "openai" | "claude" | "curl";

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  // Интерактивные состояния кабинета
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [snippetTab, setSnippetTab] = useState<SnippetTab>("openai");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  const formatNumber = (n: number): string => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeShort = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatLatency = (ms: number): string => {
    if (!ms) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} с`;
    return `${ms} мс`;
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Игнорируем, если буфер недоступен
    }
  };

  const checkBalance = async (code: string) => {
    setError("");
    setIsChecking(true);

    try {
      const response = await fetch("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError(data.error || "Неверный код доступа");
          localStorage.removeItem("accessCode");
          setBalanceData(null);
          setActiveCode("");
        } else {
          setError(data.error || "Не удалось получить баланс, попробуйте позже");
        }
        return;
      }

      setBalanceData(data);
      setActiveCode(code);
      localStorage.setItem("accessCode", code);
    } catch (err) {
      console.error("Check balance error:", err);
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      setIsChecking(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("code");

    if (codeFromUrl) {
      checkBalance(codeFromUrl);
      return;
    }

    const savedCode = localStorage.getItem("accessCode");
    if (savedCode) {
      checkBalance(savedCode);
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = accessCode.trim();
    if (code) {
      checkBalance(code);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("accessCode");
    setAccessCode("");
    setActiveCode("");
    setBalanceData(null);
    setError("");
    setModelFilter("all");
    setStatusFilter("all");
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  const handleRefresh = () => {
    const code = activeCode || localStorage.getItem("accessCode");
    if (code) {
      checkBalance(code);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!balanceData?.logs) return [];
    return balanceData.logs.filter((log) => {
      if (modelFilter !== "all" && log.model !== modelFilter) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      return true;
    });
  }, [balanceData?.logs, modelFilter, statusFilter]);

  const exportCsv = () => {
    if (!filteredLogs.length) return;
    const header = [
      "Время",
      "Модель",
      "Вход (токены)",
      "Выход (токены)",
      "Кэш (токены)",
      "Списано",
      "Задержка (мс)",
      "Статус",
    ];
    const rows = filteredLogs.map((l) => [
      l.createdAt,
      l.model,
      l.inputTokens,
      l.outputTokens,
      l.cachedTokens,
      l.costTokens,
      l.latencyMs,
      l.status,
    ]);
    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whpp-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remainingPercent = useMemo(() => {
    if (!balanceData?.tokenLimit) return null;
    const pct = (balanceData.tokenBalance / balanceData.tokenLimit) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [balanceData]);

  const snippetText = useMemo(() => {
    if (!balanceData) return "";
    const firstModel = balanceData.models[0] || "claude-haiku-4-5";
    if (snippetTab === "openai") {
      return `OPENAI_BASE_URL=${balanceData.proxyOpenaiUrl}\nOPENAI_API_KEY=ВАШ_API_КЛЮЧ\nMODEL=${firstModel}`;
    }
    if (snippetTab === "claude") {
      return `export ANTHROPIC_BASE_URL=${balanceData.proxyClaudeUrl}\nexport ANTHROPIC_AUTH_TOKEN=ВАШ_API_КЛЮЧ\nclaude`;
    }
    return `curl ${balanceData.proxyOpenaiUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ВАШ_API_КЛЮЧ" \\\n  -d '{\n    "model": "${firstModel}",\n    "messages": [{"role": "user", "content": "Привет!"}]\n  }'`;
  }, [balanceData, snippetTab]);

  const LoginSkeleton = () => (
    <div className="w-full max-w-md mx-auto card-elevated p-8 space-y-6 animate-pulse">
      <div className="text-center space-y-4">
        <div className="skeleton h-10 w-32 mx-auto" />
        <div className="skeleton h-4 w-48 mx-auto" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-12 w-full" />
      </div>
      <div className="skeleton h-14 w-full" />
      <div className="skeleton h-4 w-64 mx-auto" />
    </div>
  );

  const BalanceSkeleton = () => (
    <div className="w-full mx-auto card-elevated p-8 space-y-6 animate-pulse">
      <div className="text-center space-y-3">
        <div className="skeleton h-6 w-48 mx-auto" />
        <div className="skeleton h-4 w-32 mx-auto" />
      </div>
      <div className="bg-primary rounded-xl p-8 space-y-4">
        <div className="skeleton h-8 w-32 mx-auto bg-primary-foreground/30" />
        <div className="skeleton h-16 w-48 mx-auto bg-primary-foreground/30" />
        <div className="skeleton h-4 w-40 mx-auto bg-primary-foreground/30" />
      </div>
      <div className="stat-grid">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <main className="page-root">
        <div className="page-content">
          {balanceData ? <BalanceSkeleton /> : <LoginSkeleton />}
        </div>
      </main>
    );
  }

  return (
    <main className="page-root">
      <div className={`page-content ${balanceData ? "page-content--wide" : ""}`}>
        {!balanceData ? (
          // Экран входа
          <div className="card-elevated p-8 space-y-6 animate-fade-in">
            <div className="text-center space-y-4">
              <h1 className="text-3xl font-bold font-mono text-foreground gradient-text">
                WHPP API
              </h1>
              <p className="text-muted-foreground text-lg">
                Проверка баланса токенов
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="accessCode"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Код доступа
                </label>
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Введите ваш код доступа"
                  className="input"
                  disabled={isChecking}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400 text-center" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isChecking || !accessCode.trim()}
                className="btn-primary w-full"
              >
                {isChecking ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Проверка...
                  </>
                ) : (
                  "Проверить баланс"
                )}
              </button>
            </form>

            <p className="text-xs text-muted-foreground text-center">
              Код сохраняется для автоматического входа
            </p>
          </div>
        ) : (
          // Экран баланса
          <div className="space-y-6 animate-fade-in">
            <div className="card-elevated space-y-5">
              {/* Заголовок профиля */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-semibold text-foreground">
                      {balanceData.clientName}
                    </h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        balanceData.tokenBalance > 0
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {balanceData.tokenBalance > 0 ? "Активен" : "Исчерпан"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Обновлено: {formatDate(balanceData.updatedAt)}
                  </p>
                </div>

                {activeCode && (
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        `${window.location.origin}/?code=${encodeURIComponent(activeCode)}`,
                        "cabinet-link"
                      )
                    }
                    className="btn-secondary btn-sm"
                  >
                    {copiedKey === "cabinet-link"
                      ? "Ссылка скопирована ✓"
                      : "Ссылка на кабинет"}
                  </button>
                )}
              </div>

              {/* Главная карточка баланса */}
              <div className="balance-card rounded-xl p-7 text-center space-y-4 text-primary-foreground relative overflow-hidden">
                <div className="absolute inset-0 shimmer" />
                <div className="relative z-10 space-y-3">
                  <p className="text-xs font-medium opacity-85 tracking-widest uppercase">
                    Остаток токенов
                  </p>
                  <p className="text-4xl sm:text-5xl font-mono font-bold tracking-tight">
                    {formatNumber(balanceData.tokenBalance)}
                  </p>

                  {balanceData.tokenLimit !== null && remainingPercent !== null && (
                    <div className="max-w-md mx-auto space-y-1.5 pt-1">
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${remainingPercent.toFixed(1)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs opacity-80 font-mono">
                        <span>Осталось {remainingPercent.toFixed(1)}%</span>
                        <span>Лимит: {formatNumber(balanceData.tokenLimit)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Статистика */}
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-label">Потрачено</div>
                  <div className="stat-value">
                    {balanceData.usedTokens !== null
                      ? formatNumber(balanceData.usedTokens)
                      : "—"}
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Всего запросов</div>
                  <div className="stat-value">
                    {formatNumber(balanceData.totalLogs)}
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Моделей</div>
                  <div className="stat-value">{balanceData.models.length}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Создан</div>
                  <div className="stat-value">{balanceData.createdAt || "—"}</div>
                </div>
              </div>

              {/* Доступные модели */}
              {balanceData.models.length > 0 && (
                <div className="section-box">
                  <div className="section-header">
                    <span className="section-title">Доступные модели</span>
                    <span className="text-xs text-muted-foreground">
                      Нажмите, чтобы скопировать ID
                    </span>
                  </div>
                  <div className="chip-list">
                    {balanceData.models.map((model) => {
                      const isCopied = copiedKey === `model-${model}`;
                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => copyText(model, `model-${model}`)}
                          className={`chip-btn ${isCopied ? "chip-btn--copied" : ""}`}
                          title="Скопировать название модели"
                        >
                          <span>{model}</span>
                          <span className="opacity-70">{isCopied ? "✓" : "⧉"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Подключение к API (без упоминания поставщика) */}
              <div className="section-box space-y-3">
                <div className="section-header" style={{ marginBottom: 0 }}>
                  <span className="section-title">Подключение API</span>
                  <button
                    type="button"
                    onClick={() => setShowConnect((v) => !v)}
                    className="btn-secondary btn-sm"
                  >
                    {showConnect ? "Скрыть инструкцию" : "Примеры кода"}
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="endpoint-row">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">
                        OpenAI / Codex / Cursor Base URL
                      </div>
                      <div className="endpoint-url">{balanceData.proxyOpenaiUrl}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(balanceData.proxyOpenaiUrl, "url-v1")}
                      className="btn-secondary btn-sm shrink-0"
                    >
                      {copiedKey === "url-v1" ? "Скопировано ✓" : "Копировать"}
                    </button>
                  </div>

                  <div className="endpoint-row">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">
                        Claude Code CLI (без /v1)
                      </div>
                      <div className="endpoint-url">{balanceData.proxyClaudeUrl}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(balanceData.proxyClaudeUrl, "url-root")}
                      className="btn-secondary btn-sm shrink-0"
                    >
                      {copiedKey === "url-root" ? "Скопировано ✓" : "Копировать"}
                    </button>
                  </div>
                </div>

                {showConnect && (
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSnippetTab("openai")}
                          className={`filter-pill ${
                            snippetTab === "openai" ? "filter-pill--active" : ""
                          }`}
                        >
                          OpenAI / Codex
                        </button>
                        <button
                          type="button"
                          onClick={() => setSnippetTab("claude")}
                          className={`filter-pill ${
                            snippetTab === "claude" ? "filter-pill--active" : ""
                          }`}
                        >
                          Claude Code CLI
                        </button>
                        <button
                          type="button"
                          onClick={() => setSnippetTab("curl")}
                          className={`filter-pill ${
                            snippetTab === "curl" ? "filter-pill--active" : ""
                          }`}
                        >
                          cURL
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyText(snippetText, "snippet")}
                        className="btn-secondary btn-sm"
                      >
                        {copiedKey === "snippet" ? "Скопировано ✓" : "Копировать код"}
                      </button>
                    </div>
                    <pre className="code-block">{snippetText}</pre>
                  </div>
                )}
              </div>

              {/* История запросов */}
              {balanceData.logs.length > 0 && (
                <div className="section-box space-y-3">
                  <div className="section-header" style={{ marginBottom: 0 }}>
                    <span className="section-title">
                      Последние запросы ({filteredLogs.length})
                    </span>
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={filteredLogs.length === 0}
                      className="btn-secondary btn-sm"
                    >
                      Скачать CSV
                    </button>
                  </div>

                  {/* Фильтры */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModelFilter("all")}
                      className={`filter-pill ${
                        modelFilter === "all" ? "filter-pill--active" : ""
                      }`}
                    >
                      Все модели
                    </button>
                    {balanceData.models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModelFilter(m)}
                        className={`filter-pill ${
                          modelFilter === m ? "filter-pill--active" : ""
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setStatusFilter((prev) =>
                          prev === "all" ? "success" : prev === "success" ? "error" : "all"
                        )
                      }
                      className={`filter-pill ${
                        statusFilter !== "all" ? "filter-pill--active" : ""
                      }`}
                    >
                      Статус:{" "}
                      {statusFilter === "all"
                        ? "Все"
                        : statusFilter === "success"
                        ? "Успех"
                        : "Ошибки"}
                    </button>
                  </div>

                  <div className="logs-table-wrap">
                    <table className="logs-table">
                      <thead>
                        <tr>
                          <th>Время</th>
                          <th>Модель</th>
                          <th>Вход / Выход</th>
                          <th>Кэш</th>
                          <th>Списано</th>
                          <th>Скорость</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center opacity-70 py-4">
                              Нет записей по выбранным фильтрам
                            </td>
                          </tr>
                        ) : (
                          filteredLogs.map((log, idx) => (
                            <tr key={`${log.createdAt}-${idx}`}>
                              <td className="font-mono text-xs">
                                {formatTimeShort(log.createdAt)}
                              </td>
                              <td className="font-mono text-xs">{log.model}</td>
                              <td className="font-mono text-xs">
                                {formatNumber(log.inputTokens)} /{" "}
                                {formatNumber(log.outputTokens)}
                              </td>
                              <td className="font-mono text-xs">
                                {formatNumber(log.cachedTokens)}
                              </td>
                              <td className="font-mono text-xs font-semibold">
                                -{formatNumber(log.costTokens)}
                              </td>
                              <td className="font-mono text-xs">
                                {formatLatency(log.latencyMs)}
                              </td>
                              <td>
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                    log.status === "success"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                  }`}
                                >
                                  {log.status === "success" ? "OK" : "Ошибка"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400 text-center" role="alert">
                  {error}
                </p>
              )}

              <div className="button-row flex gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isChecking}
                  className="btn-primary flex-1"
                >
                  {isChecking ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Обновление...
                    </>
                  ) : (
                    "Обновить"
                  )}
                </button>
                <button onClick={handleLogout} className="btn-secondary flex-1">
                  Выйти
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                © 2026 WHPP API. Все права защищены.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}