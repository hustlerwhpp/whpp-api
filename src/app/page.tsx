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

type TabKey = "overview" | "models" | "connect" | "history" | "help";
type AppTarget = "codex" | "cursor" | "continue" | "claude_cli" | "python" | "curl";
type OsTarget = "windows" | "macos" | "linux";
type Lang = "ru" | "en";

const MODEL_FAMILIES = [
  "Все",
  "GPT",
  "Claude",
  "DeepSeek",
  "Nemotron",
  "Gemini",
  "Grok",
  "Другие",
] as const;

const FAQ_ITEMS = [
  {
    q: "Чем отличаются эндпоинты с /v1 и без /v1?",
    a: "Большинство OpenAI-совместимых приложений (Cursor, Codex, Continue, Python SDK) требуют адрес с /v1 на конце. Claude Code CLI ожидает корневой адрес без /v1.",
  },
  {
    q: "Ошибка 401 или запросы уходят на api.openai.com",
    a: "Проверьте, что в настройках клиента указан именно наш Base URL с протоколом https:// и сохранён актуальный API-ключ без лишних пробелов.",
  },
  {
    q: "Ошибка Model not found",
    a: "Убедитесь, что название модели скопировано точно из вкладки «Модели» (с учётом регистра и дефисов).",
  },
  {
    q: "Ошибки 429, 502, 503 или 504",
    a: "Это временный лимит или задержка на стороне модели. Подождите 10–15 секунд и повторите запрос. Для длинных ответов включите потоковый режим (stream: true).",
  },
  {
    q: "В приложении Claude модели просят Upgrade",
    a: "Проверьте, что в конфигурации указан наш Base URL без /v1 и переменная окружения с токеном применена в текущей сессии терминала.",
  },
];

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  // Тема и язык
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<Lang>("ru");

  // Навигация и состояния вкладок
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Модели
  const [modelSearch, setModelSearch] = useState("");
  const [modelFamily, setModelFamily] = useState<string>("Все");

  // Мастер подключения
  const [appTarget, setAppTarget] = useState<AppTarget>("cursor");
  const [osTarget, setOsTarget] = useState<OsTarget>("windows");
  const [selectedModel, setSelectedModel] = useState<string>("");

  // История
  const [historyModelFilter, setHistoryModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  // Помощь
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [errorInput, setErrorInput] = useState("");
  const [errorDiagnosis, setErrorDiagnosis] = useState<string | null>(null);

  // Инициализация темы
  useEffect(() => {
    const savedTheme = localStorage.getItem("whpp_theme");
    if (savedTheme === "dark") {
      setDarkMode(true);
    } else if (savedTheme === "light") {
      setDarkMode(false);
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setDarkMode(true);
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("whpp_theme", next ? "dark" : "light");
      return next;
    });
  };

  const formatNumber = (n: number): string => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
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
    return d.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatLatency = (ms: number): string => {
    if (!ms) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} ${lang === "ru" ? "с" : "s"}`;
    return `${ms} ${lang === "ru" ? "мс" : "ms"}`;
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
      if (Array.isArray(data.models) && data.models.length > 0) {
        setSelectedModel((prev) => prev || data.models[0]);
      }
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
    setActiveTab("overview");
    setHistoryModelFilter("all");
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

  // Фильтрация моделей
  const filteredModels = useMemo(() => {
    if (!balanceData?.models) return [];
    const q = modelSearch.trim().toLowerCase();
    return balanceData.models.filter((m) => {
      const lower = m.toLowerCase();
      if (q && !lower.includes(q)) return false;
      if (modelFamily === "Все") return true;
      if (modelFamily === "GPT") return lower.includes("gpt") || lower.includes("o1") || lower.includes("o3");
      if (modelFamily === "Claude") return lower.includes("claude");
      if (modelFamily === "DeepSeek") return lower.includes("deepseek");
      if (modelFamily === "Nemotron") return lower.includes("nemotron");
      if (modelFamily === "Gemini") return lower.includes("gemini");
      if (modelFamily === "Grok") return lower.includes("grok");
      // Другие
      return (
        !lower.includes("gpt") &&
        !lower.includes("claude") &&
        !lower.includes("deepseek") &&
        !lower.includes("nemotron") &&
        !lower.includes("gemini") &&
        !lower.includes("grok")
      );
    });
  }, [balanceData?.models, modelSearch, modelFamily]);

  // Фильтрация логов
  const filteredLogs = useMemo(() => {
    if (!balanceData?.logs) return [];
    return balanceData.logs.filter((log) => {
      if (historyModelFilter !== "all" && log.model !== historyModelFilter) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      return true;
    });
  }, [balanceData?.logs, historyModelFilter, statusFilter]);

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

  // Активный Base URL и сниппет для мастера подключения
  const activeBaseUrl = useMemo(() => {
    if (!balanceData) return "";
    return appTarget === "claude_cli"
      ? balanceData.proxyClaudeUrl
      : balanceData.proxyOpenaiUrl;
  }, [balanceData, appTarget]);

  const connectSnippet = useMemo(() => {
    if (!balanceData) return "";
    const model = selectedModel || balanceData.models[0] || "claude-haiku-4-5";
    const isWin = osTarget === "windows";

    if (appTarget === "claude_cli") {
      return isWin
        ? `$env:ANTHROPIC_BASE_URL="${balanceData.proxyClaudeUrl}"\n$env:ANTHROPIC_AUTH_TOKEN="ВАШ_API_КЛЮЧ"\nclaude --model ${model}`
        : `export ANTHROPIC_BASE_URL="${balanceData.proxyClaudeUrl}"\nexport ANTHROPIC_AUTH_TOKEN="ВАШ_API_КЛЮЧ"\nclaude --model ${model}`;
    }
    if (appTarget === "continue") {
      return JSON.stringify(
        {
          models: [
            {
              title: `WHPP (${model})`,
              provider: "openai",
              model,
              apiBase: balanceData.proxyOpenaiUrl,
              apiKey: "ВАШ_API_КЛЮЧ",
            },
          ],
        },
        null,
        2
      );
    }
    if (appTarget === "python") {
      return `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${balanceData.proxyOpenaiUrl}",\n    api_key="ВАШ_API_КЛЮЧ",\n)\n\nres = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Привет!"}],\n)\nprint(res.choices[0].message.content)`;
    }
    if (appTarget === "curl") {
      return `curl ${balanceData.proxyOpenaiUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ВАШ_API_КЛЮЧ" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"Привет!"}]}'`;
    }
    // cursor / codex
    return `Base URL: ${balanceData.proxyOpenaiUrl}\nAPI Key:  ВАШ_API_КЛЮЧ\nModel:    ${model}`;
  }, [balanceData, appTarget, osTarget, selectedModel]);

  const diagnoseError = () => {
    const txt = errorInput.trim().toLowerCase();
    if (!txt) {
      setErrorDiagnosis("Вставьте текст ошибки выше, чтобы получить подсказку.");
      return;
    }
    if (txt.includes("failed to parse url") || txt.includes("invalid url")) {
      setErrorDiagnosis(
        "В адресе Base URL отсутствует протокол https://. Укажите полный адрес вида https://..."
      );
      return;
    }
    if (txt.includes("401") || txt.includes("unauthorized") || txt.includes("invalid api key")) {
      setErrorDiagnosis(
        "Ошибка 401: проверьте API-ключ на отсутствие лишних пробелов и убедитесь, что выбран правильный Base URL (не api.openai.com)."
      );
      return;
    }
    if (txt.includes("model not found") || txt.includes("404")) {
      setErrorDiagnosis(
        "Модель не найдена или неверный путь. Для OpenAI/Cursor в конце Base URL должен быть /v1, а название модели нужно скопировать из вкладки «Модели»."
      );
      return;
    }
    if (txt.includes("429") || txt.includes("rate limit")) {
      setErrorDiagnosis(
        "Ошибка 429: превышена частота запросов. Подождите 10–15 секунд и повторите."
      );
      return;
    }
    if (txt.includes("502") || txt.includes("503") || txt.includes("504") || txt.includes("timeout")) {
      setErrorDiagnosis(
        "Таймаут или временный сбой шлюза (502/504). Включите streaming (stream: true) в настройках клиента или повторите запрос через минуту."
      );
      return;
    }
    setErrorDiagnosis(
      "Проверьте три вещи: Base URL начинается с https://, путь /v1 указан корректно для вашего клиента, и баланс токенов больше нуля."
    );
  };

  const openConnectFor = (target: AppTarget, model?: string) => {
    setAppTarget(target);
    if (model) setSelectedModel(model);
    setActiveTab("connect");
  };

  const t = {
    title: lang === "ru" ? "WHPP API" : "WHPP API",
    subtitle: lang === "ru" ? "Кабинет покупателя" : "Client Portal",
    checkBalance: lang === "ru" ? "Проверить баланс" : "Check Balance",
    changeCode: lang === "ru" ? "Сменить код" : "Switch Code",
    connectBtn: lang === "ru" ? "Подключить" : "Connect",
    active: lang === "ru" ? "Активен" : "Active",
    exhausted: lang === "ru" ? "Исчерпан" : "Exhausted",
    tabs: {
      overview: lang === "ru" ? "Обзор" : "Overview",
      models: lang === "ru" ? "Модели" : "Models",
      connect: lang === "ru" ? "Подключение" : "Connect",
      history: lang === "ru" ? "История" : "History",
      help: lang === "ru" ? "Помощь" : "Help",
    },
  };

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
    </div>
  );

  if (isLoading) {
    return (
      <main className={`page-root page-root--centered ${darkMode ? "theme-dark" : ""}`}>
        <div className="page-content">
          <LoginSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main
      className={`page-root ${!balanceData ? "page-root--centered" : ""} ${
        darkMode ? "theme-dark" : ""
      }`}
    >
      <div className={`page-content ${balanceData ? "page-content--wide" : ""}`}>
        {!balanceData ? (
          // ЭКРАН ВХОДА
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t.subtitle}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === "ru" ? "en" : "ru"))}
                  className="btn-secondary btn-sm"
                >
                  {lang === "ru" ? "English" : "Русский"}
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="btn-secondary btn-icon"
                  title="Переключить тему"
                  aria-label="Переключить тему"
                >
                  {darkMode ? "☀️" : "🌙"}
                </button>
              </div>
            </div>

            <div className="card-elevated space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold font-mono gradient-text">
                  {t.title}
                </h1>
                <p className="text-muted-foreground text-base">
                  {lang === "ru"
                    ? "Проверка баланса и настройка подключения"
                    : "Token balance and API setup"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="accessCode"
                    className="block text-sm font-medium mb-2"
                  >
                    {lang === "ru" ? "Код доступа" : "Access code"}
                  </label>
                  <input
                    id="accessCode"
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder={
                      lang === "ru" ? "Введите ваш код доступа" : "Enter your access code"
                    }
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
                  {isChecking ? (lang === "ru" ? "Проверка..." : "Checking...") : t.checkBalance}
                </button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                {lang === "ru"
                  ? "Код сохраняется в браузере для автоматического входа"
                  : "Access code is saved in your browser"}
              </p>
            </div>

            {/* FAQ на экране входа */}
            <div className="card-elevated space-y-3" style={{ padding: "22px" }}>
              <div className="section-title">{lang === "ru" ? "Частые вопросы" : "FAQ"}</div>
              <div className="space-y-2">
                {FAQ_ITEMS.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="faq-item">
                    <button
                      type="button"
                      className="faq-trigger"
                      onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                    >
                      <span>{item.q}</span>
                      <span>{openFaq === idx ? "−" : "+"}</span>
                    </button>
                    {openFaq === idx && <div className="faq-body">{item.a}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // ЛИЧНЫЙ КАБИНЕТ ПОКУПАТЕЛЯ
          <div className="space-y-4 animate-fade-in">
            {/* Верхняя шапка */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-bold font-mono gradient-text">
                  {t.title}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    balanceData.tokenBalance > 0
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {balanceData.tokenBalance > 0 ? t.active : t.exhausted}
                </span>
                <span className="text-sm font-medium">{balanceData.clientName}</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab("connect")}
                  className="btn-primary btn-sm"
                >
                  {t.connectBtn}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-secondary btn-sm"
                >
                  {t.changeCode}
                </button>
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === "ru" ? "en" : "ru"))}
                  className="btn-secondary btn-sm"
                >
                  {lang === "ru" ? "EN" : "RU"}
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="btn-secondary btn-icon"
                  title="Переключить тему"
                  aria-label="Переключить тему"
                >
                  {darkMode ? "☀️" : "🌙"}
                </button>
              </div>
            </div>

            <div className="card-elevated">
              <div className="cabinet-grid">
                {/* Боковое меню вкладок (без переноса токенов) */}
                <aside className="sidebar-nav" aria-label="Разделы кабинета">
                  {(
                    [
                      ["overview", t.tabs.overview],
                      ["models", `${t.tabs.models} (${balanceData.models.length})`],
                      ["connect", t.tabs.connect],
                      ["history", `${t.tabs.history} (${balanceData.logs.length})`],
                      ["help", t.tabs.help],
                    ] as [TabKey, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={`nav-tab ${activeTab === key ? "nav-tab--active" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </aside>

                {/* Контент активной вкладки */}
                <section className="space-y-5 min-w-0">
                  {activeTab === "overview" && (
                    <>
                      {/* Карточка баланса */}
                      <div className="balance-card rounded-xl p-7 text-center space-y-4 text-primary-foreground relative overflow-hidden">
                        <div className="absolute inset-0 shimmer" />
                        <div className="relative z-10 space-y-3">
                          <p className="text-xs font-medium opacity-85 tracking-widest uppercase">
                            {lang === "ru" ? "Остаток токенов" : "Token Balance"}
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
                                <span>
                                  {lang === "ru" ? "Осталось" : "Left"}{" "}
                                  {remainingPercent.toFixed(1)}%
                                </span>
                                <span>
                                  {lang === "ru" ? "Лимит:" : "Limit:"}{" "}
                                  {formatNumber(balanceData.tokenLimit)}
                                </span>
                              </div>
                            </div>
                          )}

                          <p className="text-xs opacity-75">
                            {lang === "ru" ? "Обновлено:" : "Updated:"}{" "}
                            {formatDate(balanceData.updatedAt)}
                          </p>
                        </div>
                      </div>

                      {/* Быстрые действия */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleRefresh}
                          disabled={isChecking}
                          className="btn-primary btn-sm"
                        >
                          {isChecking
                            ? lang === "ru"
                              ? "Обновление..."
                              : "Refreshing..."
                            : lang === "ru"
                            ? "Обновить баланс"
                            : "Refresh"}
                        </button>
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
                        <button
                          type="button"
                          onClick={() => setActiveTab("models")}
                          className="btn-secondary btn-sm"
                        >
                          Открыть список моделей
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          className="btn-secondary btn-sm"
                        >
                          Вся история
                        </button>
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
                          <div className="stat-label">Запросов</div>
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

                      {/* Быстрое подключение */}
                      <div className="section-box space-y-3">
                        <div className="section-header" style={{ marginBottom: 0 }}>
                          <span className="section-title">Быстрое подключение</span>
                          <button
                            type="button"
                            onClick={() => setActiveTab("connect")}
                            className="btn-secondary btn-sm"
                          >
                            Все настройки →
                          </button>
                        </div>
                        <div className="quick-grid">
                          <button
                            type="button"
                            onClick={() => openConnectFor("codex")}
                            className="quick-card"
                          >
                            <div>
                              <div className="text-sm font-semibold">Codex</div>
                              <div className="text-xs text-muted-foreground">OpenAI /v1</div>
                            </div>
                            <span>→</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openConnectFor("cursor")}
                            className="quick-card"
                          >
                            <div>
                              <div className="text-sm font-semibold">Cursor</div>
                              <div className="text-xs text-muted-foreground">IDE /v1</div>
                            </div>
                            <span>→</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openConnectFor("claude_cli")}
                            className="quick-card"
                          >
                            <div>
                              <div className="text-sm font-semibold">Claude Code</div>
                              <div className="text-xs text-muted-foreground">CLI без /v1</div>
                            </div>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === "models" && (
                    <div className="space-y-4">
                      <div className="section-header" style={{ marginBottom: 0 }}>
                        <h3 className="text-lg font-semibold">Доступные модели</h3>
                        <span className="text-xs text-muted-foreground">
                          Найдено: {filteredModels.length}
                        </span>
                      </div>

                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="Название или ID модели..."
                        className="input"
                      />

                      <div className="flex flex-wrap gap-1.5">
                        {MODEL_FAMILIES.map((fam) => (
                          <button
                            key={fam}
                            type="button"
                            onClick={() => setModelFamily(fam)}
                            className={`filter-pill ${
                              modelFamily === fam ? "filter-pill--active" : ""
                            }`}
                          >
                            {fam}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        {filteredModels.length === 0 ? (
                          <div className="section-box text-center text-sm text-muted-foreground">
                            Модели по вашему запросу не найдены
                          </div>
                        ) : (
                          filteredModels.map((model) => {
                            const isCopied = copiedKey === `model-${model}`;
                            return (
                              <div key={model} className="model-row">
                                <div className="font-mono text-sm truncate">{model}</div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => copyText(model, `model-${model}`)}
                                    className="btn-secondary btn-sm"
                                  >
                                    {isCopied ? "Скопировано ✓" : "Копировать ID"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openConnectFor(appTarget, model)}
                                    className="btn-primary btn-sm"
                                  >
                                    Подключить
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "connect" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Мастер подключения</h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1.5">
                            Где хотите использовать?
                          </label>
                          <select
                            value={appTarget}
                            onChange={(e) => setAppTarget(e.target.value as AppTarget)}
                            className="select-input"
                          >
                            <option value="cursor">Cursor</option>
                            <option value="codex">Codex</option>
                            <option value="continue">Continue · VS Code</option>
                            <option value="claude_cli">Claude Code CLI</option>
                            <option value="python">OpenAI SDK (Python)</option>
                            <option value="curl">cURL</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-muted-foreground mb-1.5">
                            Ваша система
                          </label>
                          <select
                            value={osTarget}
                            onChange={(e) => setOsTarget(e.target.value as OsTarget)}
                            className="select-input"
                          >
                            <option value="windows">Windows</option>
                            <option value="macos">macOS</option>
                            <option value="linux">Linux</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-muted-foreground mb-1.5">
                            Модель
                          </label>
                          <select
                            value={selectedModel || balanceData.models[0] || ""}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="select-input"
                          >
                            {balanceData.models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="section-box space-y-2.5">
                        <div className="endpoint-row">
                          <div className="min-w-0">
                            <div className="text-[11px] text-muted-foreground">
                              Base URL
                            </div>
                            <div className="endpoint-url">{activeBaseUrl}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(activeBaseUrl, "connect-baseurl")}
                            className="btn-secondary btn-sm shrink-0"
                          >
                            {copiedKey === "connect-baseurl" ? "Скопировано ✓" : "Копировать"}
                          </button>
                        </div>

                        <div className="endpoint-row">
                          <div className="min-w-0">
                            <div className="text-[11px] text-muted-foreground">
                              Model ID
                            </div>
                            <div className="endpoint-url">
                              {selectedModel || balanceData.models[0] || "—"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                selectedModel || balanceData.models[0] || "",
                                "connect-model"
                              )
                            }
                            className="btn-secondary btn-sm shrink-0"
                          >
                            {copiedKey === "connect-model" ? "Скопировано ✓" : "Копировать"}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="section-title">Готовые настройки</span>
                          <button
                            type="button"
                            onClick={() => copyText(connectSnippet, "connect-snippet")}
                            className="btn-primary btn-sm"
                          >
                            {copiedKey === "connect-snippet"
                              ? "Скопировано ✓"
                              : "Копировать настройки"}
                          </button>
                        </div>
                        <pre className="code-block">{connectSnippet}</pre>
                      </div>
                    </div>
                  )}

                  {activeTab === "history" && (
                    <div className="space-y-4">
                      <div className="section-header" style={{ marginBottom: 0 }}>
                        <h3 className="text-lg font-semibold">
                          История запросов ({filteredLogs.length})
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isChecking}
                            className="btn-secondary btn-sm"
                          >
                            {isChecking ? "Обновление..." : "Обновить"}
                          </button>
                          <button
                            type="button"
                            onClick={exportCsv}
                            disabled={filteredLogs.length === 0}
                            className="btn-primary btn-sm"
                          >
                            Скачать CSV
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryModelFilter("all")}
                          className={`filter-pill ${
                            historyModelFilter === "all" ? "filter-pill--active" : ""
                          }`}
                        >
                          Все модели
                        </button>
                        {balanceData.models.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setHistoryModelFilter(m)}
                            className={`filter-pill ${
                              historyModelFilter === m ? "filter-pill--active" : ""
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setStatusFilter((prev) =>
                              prev === "all"
                                ? "success"
                                : prev === "success"
                                ? "error"
                                : "all"
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
                                <td colSpan={7} className="text-center opacity-70 py-6">
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

                  {activeTab === "help" && (
                    <div className="space-y-5">
                      <h3 className="text-lg font-semibold">Помощь и диагностика</h3>

                      <div className="section-box space-y-3">
                        <div className="section-title">Разбор ошибки</div>
                        <textarea
                          value={errorInput}
                          onChange={(e) => setErrorInput(e.target.value)}
                          placeholder="Вставьте текст ошибки из редактора или терминала (необязательно)..."
                          className="textarea-input"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={diagnoseError}
                            className="btn-primary btn-sm"
                          >
                            Объяснить ошибку
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `Клиент: ${balanceData.clientName}\nОстаток: ${balanceData.tokenBalance}\nBase URL: ${balanceData.proxyOpenaiUrl}\nОшибка: ${errorInput || "нет"}`,
                                "support-data"
                              )
                            }
                            className="btn-secondary btn-sm"
                          >
                            {copiedKey === "support-data"
                              ? "Скопировано ✓"
                              : "Скопировать данные для поддержки"}
                          </button>
                        </div>
                        {errorDiagnosis && (
                          <div className="text-sm p-3 rounded-xl bg-indigo-50 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                            {errorDiagnosis}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="section-title">Частые вопросы</div>
                        {FAQ_ITEMS.map((item, idx) => (
                          <div key={idx} className="faq-item">
                            <button
                              type="button"
                              className="faq-trigger"
                              onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                            >
                              <span>{item.q}</span>
                              <span>{openFaq === idx ? "−" : "+"}</span>
                            </button>
                            {openFaq === idx && <div className="faq-body">{item.a}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && (
                    <p className="text-sm text-red-500 dark:text-red-400 text-center" role="alert">
                      {error}
                    </p>
                  )}
                </section>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              © 2026 WHPP API. Все права защищены.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}