"use client";

import { useState, useEffect, FormEvent } from "react";
import "./visual.css";

interface BalanceData {
  clientName: string;
  tokenBalance: number;
  updatedAt: string;
}

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const formatNumber = (n: number): string => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const formatDate = (iso: string): string => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
        } else {
          setError(data.error || "Не удалось получить баланс, попробуйте позже");
        }
        return;
      }

      setBalanceData(data);
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
    setBalanceData(null);
    setError("");
  };

  const handleRefresh = () => {
    const savedCode = localStorage.getItem("accessCode");
    if (savedCode) {
      checkBalance(savedCode);
    }
  };

  // Скелетон для экрана входа
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

  // Скелетон для экрана баланса
  const BalanceSkeleton = () => (
    <div className="w-full max-w-md mx-auto card-elevated p-8 space-y-6 animate-pulse">
      <div className="text-center space-y-3">
        <div className="skeleton h-6 w-48 mx-auto" />
        <div className="skeleton h-4 w-32 mx-auto" />
      </div>
      <div className="bg-primary rounded-xl p-8 space-y-4">
        <div className="skeleton h-8 w-32 mx-auto bg-primary-foreground/30" />
        <div className="skeleton h-16 w-48 mx-auto bg-primary-foreground/30" />
        <div className="skeleton h-4 w-40 mx-auto bg-primary-foreground/30" />
      </div>
      <div className="skeleton h-4 w-48 mx-auto" />
      <div className="flex gap-3">
        <div className="skeleton h-12 w-full flex-1" />
        <div className="skeleton h-12 w-full flex-1" />
      </div>
      <div className="skeleton h-4 w-56 mx-auto" />
    </div>
  );

  if (isLoading) {
    return (
      <main className="page-root">
        {balanceData ? <BalanceSkeleton /> : <LoginSkeleton />}
      </main>
    );
  }

  return (
    <main className="page-root">
      <div className="page-content">
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
            <div className="card-elevated p-8 space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-xl font-semibold text-foreground">
                  {balanceData.clientName}
                </h2>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Активен
                </span>
              </div>

              <div className="balance-card bg-gradient-to-br from-primary to-blue-600 rounded-xl p-8 text-center space-y-4 text-primary-foreground relative overflow-hidden">
                <div className="absolute inset-0 shimmer" />
                <div className="relative z-10">
                  <p className="text-sm font-medium opacity-90 tracking-wider">
                    БАЛАНС ТОКЕНОВ
                  </p>
                  <p className="text-5xl font-mono font-bold tracking-tight">
                    {formatNumber(balanceData.tokenBalance)}
                  </p>
                  <p className="text-sm opacity-75">
                    Последнее обновление: {formatDate(balanceData.updatedAt)}
                  </p>
                </div>
              </div>

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
                <button
                  onClick={handleLogout}
                  className="btn-secondary flex-1"
                >
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