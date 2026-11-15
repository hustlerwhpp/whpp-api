"use client";

import { useEffect, useState, FormEvent } from "react";
import "../visual.css";

interface AdminClient {
  accessCode: string;
  name: string;
  orderCode: string;
  tokenBalance: number | null;
  tokenLimit: number | null;
  usedTokens: number | null;
  createdAt: string | null;
  totalLogs: number | null;
  error?: string;
}

interface Deployment {
  id: string;
  url: string | null;
  state: string | null;
}

interface CreatedClient {
  accessCode: string;
  name: string;
  cabinetUrl: string;
}

const formatNumber = (n: number | null): string => {
  if (n === null || n === undefined) return "—";
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export default function AdminPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const [clients, setClients] = useState<AdminClient[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrderCode, setNewOrderCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<CreatedClient | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deployNote, setDeployNote] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem("whpp_theme");
    if (savedTheme === "dark") setDarkMode(true);
    else if (savedTheme === "light") setDarkMode(false);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setDarkMode(true);
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("whpp_theme", next ? "dark" : "light");
      return next;
    });
  };

  const copyText = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Игнорируем, если буфер недоступен
    }
  };

  const loadClients = async () => {
    setIsLoadingClients(true);
    try {
      const res = await fetch("/api/admin/clients");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить клиентов");
        return;
      }
      setClients(Array.isArray(data.clients) ? data.clients : []);
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (res.ok && data.role === "admin") {
          setAuthed(true);
          await loadClients();
        }
      } catch {
        // Нет сессии — показываем форму входа
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Отслеживание редеплоя после создания/удаления/смены кода.
  useEffect(() => {
    if (!deployment || !deployment.id || deployment.id === "hook") return;
    if (["READY", "ERROR", "CANCELED"].includes(deployment.state || "")) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/deployments/${encodeURIComponent(deployment.id)}`);
        const data = await res.json();
        if (res.ok && data.deployment) {
          setDeployment(data.deployment);
          if (data.deployment.state === "READY") {
            setDeployNote("Редеплой завершён — новые данные уже действуют.");
            await loadClients();
          }
        }
      } catch {
        // Молча ждём следующий тик
      }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployment?.id, deployment?.state]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const pw = password.trim();
    if (!pw) return;
    setError("");
    setIsChecking(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Неверный пароль");
        return;
      }
      setPassword("");
      setAuthed(true);
      await loadClients();
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Игнорируем
    }
    setAuthed(false);
    setClients([]);
    setCreated(null);
    setDeployment(null);
    setDeployNote("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const orderCode = newOrderCode.trim();
    if (!name || !orderCode) return;
    setError("");
    setDeployNote("");
    setCreated(null);
    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, orderCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось создать клиента");
        return;
      }
      setCreated({
        accessCode: data.client.accessCode,
        name: data.client.name,
        cabinetUrl: data.client.cabinetUrl,
      });
      setNewName("");
      setNewOrderCode("");
      if (data.deployment) {
        setDeployment(data.deployment);
        setDeployNote(
          "Клиент сохранён, идёт редеплой (~минута). Ссылка на кабинет заработает, когда он завершится."
        );
      }
      if (data.deployError) setDeployNote(data.deployError);
      await loadClients();
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (code: string, name: string) => {
    if (!window.confirm(`Удалить клиента «${name}»? Его код доступа сразу перестанет работать.`)) {
      return;
    }
    setError("");
    setDeployNote("");
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось удалить клиента");
        return;
      }
      if (data.deployment) {
        setDeployment(data.deployment);
        setDeployNote("Клиент удалён, идёт редеплой (~минута).");
      }
      if (data.deployError) setDeployNote(data.deployError);
      await loadClients();
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    }
  };

  const handleRegenerate = async (code: string, name: string) => {
    if (
      !window.confirm(
        `Выдать клиенту «${name}» новый код доступа? Старый сразу перестанет работать.`
      )
    ) {
      return;
    }
    setError("");
    setDeployNote("");
    setCreated(null);
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось сменить код");
        return;
      }
      setCreated({
        accessCode: data.client.accessCode,
        name: data.client.name,
        cabinetUrl: data.client.cabinetUrl,
      });
      if (data.deployment) {
        setDeployment(data.deployment);
        setDeployNote("Код сменён, идёт редеплой (~минута). Новая ссылка заработает после него.");
      }
      if (data.deployError) setDeployNote(data.deployError);
      await loadClients();
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    }
  };

  const handleRedeploy = async () => {
    setError("");
    setDeployNote("");
    try {
      const res = await fetch("/api/admin/redeploy", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось запустить редеплой");
        return;
      }
      setDeployment(data.deployment);
      setDeployNote("Редеплой запущен, статус обновляется ниже.");
    } catch {
      setError("Ошибка сети. Проверьте подключение и попробуйте снова.");
    }
  };

  if (isLoading) {
    return (
      <main className={`page-root page-root--centered ${darkMode ? "theme-dark" : ""}`}>
        <div className="page-content">
          <div className="card-elevated stack-md">
            <div className="skeleton" style={{ height: 34, width: 140, margin: "0 auto" }} />
            <div className="skeleton" style={{ height: 48, width: "100%" }} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`page-root ${authed ? "" : "page-root--centered"} ${darkMode ? "theme-dark" : ""}`}>
      <div className={`page-content ${authed ? "page-content--wide" : ""}`}>
        {!authed ? (
          <div className="stack-md">
            <div className="topbar">
              <span className="text-muted-sm">WHPP API — Админка</span>
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

            <div className="card-elevated stack-md">
              <div style={{ textAlign: "center" }} className="stack-sm">
                <h1 className="brand-title gradient-text" style={{ fontSize: 30, margin: 0 }}>
                  Админка
                </h1>
                <p className="text-muted-sm" style={{ fontSize: 15, margin: 0 }}>
                  Вход только для администратора
                </p>
              </div>

              <form onSubmit={handleLogin} className="stack-md">
                <div>
                  <label htmlFor="adminPassword" className="field-label">
                    Пароль администратора
                  </label>
                  <input
                    id="adminPassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    className="input"
                    disabled={isChecking}
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={isChecking || !password.trim()} className="btn-primary btn-full">
                  {isChecking ? "Проверка..." : "Войти"}
                </button>
              </form>

              <p className="footer-copy">
                <a href="/">← Кабинет клиента</a>
              </p>
            </div>
          </div>
        ) : (
          <div className="stack-md">
            <div className="topbar">
              <div className="topbar-left">
                <span className="brand-title gradient-text">Админка</span>
                <span className="client-name">WHPP API</span>
              </div>
              <div className="topbar-right">
                <button type="button" onClick={handleRedeploy} className="btn-secondary btn-sm">
                  Редеплой
                </button>
                <button type="button" onClick={handleLogout} className="btn-secondary btn-sm">
                  Выйти
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

            {deployNote && <div className="diagnosis-box">{deployNote}</div>}
            {deployment && deployment.id !== "hook" && (
              <div className="section-box" style={{ fontSize: 14 }}>
                Деплой: <b>{deployment.state || "—"}</b>
                {deployment.url ? (
                  <>
                    {" · "}
                    <a href={`https://${deployment.url}`} target="_blank" rel="noreferrer">
                      {deployment.url}
                    </a>
                  </>
                ) : null}
              </div>
            )}

            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            {created && (
              <div className="card-elevated stack-sm">
                <div className="section-title">Новый клиент: {created.name}</div>
                <div className="endpoint-row">
                  <div className="endpoint-info">
                    <div className="endpoint-label">Код доступа — отправьте его клиенту один раз</div>
                    <div className="endpoint-url">{created.accessCode}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(created.accessCode, "created-code")}
                    className="btn-primary btn-sm"
                  >
                    {copiedKey === "created-code" ? "Скопировано ✓" : "Копировать код"}
                  </button>
                </div>
                <div className="endpoint-row">
                  <div className="endpoint-info">
                    <div className="endpoint-label">Ссылка на кабинет</div>
                    <div className="endpoint-url">{created.cabinetUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(created.cabinetUrl, "created-link")}
                    className="btn-secondary btn-sm"
                  >
                    {copiedKey === "created-link" ? "Скопировано ✓" : "Копировать ссылку"}
                  </button>
                </div>
              </div>
            )}

            <div className="card-elevated stack-md">
              <div className="section-title">Создать клиента</div>
              <form onSubmit={handleCreate} className="stack-md">
                <div className="form-grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <label htmlFor="newName" className="field-label">
                      Имя клиента
                    </label>
                    <input
                      id="newName"
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Например, Иван"
                      className="input"
                      disabled={isCreating}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="newOrderCode" className="field-label">
                      Код заказа (triklz)
                    </label>
                    <input
                      id="newOrderCode"
                      type="text"
                      value={newOrderCode}
                      onChange={(e) => setNewOrderCode(e.target.value)}
                      placeholder="Код с triklz27.ru/keys"
                      className="input"
                      disabled={isCreating}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCreating || !newName.trim() || !newOrderCode.trim()}
                  className="btn-primary"
                >
                  {isCreating ? "Сохранение..." : "Создать и запустить редеплой"}
                </button>
                <p className="text-muted-sm" style={{ margin: 0 }}>
                  Код доступа генерируется сам. Клиенты друг друга не видят: каждый входит
                  только по своему коду и видит только свой баланс.
                </p>
              </form>
            </div>

            <div className="card-elevated stack-md">
              <div className="section-header" style={{ marginBottom: 0 }}>
                <h3 className="heading-lg">Клиенты ({clients.length})</h3>
                <button
                  type="button"
                  onClick={loadClients}
                  disabled={isLoadingClients}
                  className="btn-secondary btn-sm"
                >
                  {isLoadingClients ? "Обновление..." : "Обновить"}
                </button>
              </div>

              {clients.length === 0 ? (
                <div className="section-box text-muted-sm" style={{ textAlign: "center" }}>
                  Клиентов пока нет — создайте первого выше.
                </div>
              ) : (
                <div className="stack-sm">
                  {clients.map((client) => (
                    <div key={client.accessCode} className="model-row" style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{client.name}</div>
                        <div className="text-muted-sm" style={{ wordBreak: "break-all" }}>
                          Код: {client.accessCode}
                        </div>
                        <div className="text-muted-sm">
                          Баланс:{" "}
                          {client.error
                            ? client.error
                            : `${formatNumber(client.tokenBalance)} токенов`}
                          {client.tokenLimit !== null &&
                            ` / лимит ${formatNumber(client.tokenLimit)}`}
                          {client.totalLogs !== null && ` · запросов: ${client.totalLogs}`}
                        </div>
                      </div>
                      <div className="actions-row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              `${window.location.origin}/?code=${encodeURIComponent(client.accessCode)}`,
                              `link-${client.accessCode}`
                            )
                          }
                          className="btn-secondary btn-sm"
                        >
                          {copiedKey === `link-${client.accessCode}`
                            ? "Ссылка ✓"
                            : "Ссылка"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(client.accessCode, client.name)}
                          className="btn-secondary btn-sm"
                        >
                          Сменить код
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client.accessCode, client.name)}
                          className="btn-secondary btn-sm"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="footer-copy">© 2026 WHPP API. Все права защищены.</p>
          </div>
        )}
      </div>
    </main>
  );
}
