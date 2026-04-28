"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, remember }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao fazer login.");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="login-identifier">
          Usuario ou email
        </label>
        <input
          className="field__input"
          type="text"
          id="login-identifier"
          autoComplete="username"
          placeholder="voce@slice.global"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="login-password">
          Senha
        </label>
        <input
          className="field__input"
          type="password"
          id="login-password"
          autoComplete="current-password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div className="field-row">
        <label className="field-row__label" htmlFor="remember">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Manter conectado
        </label>
      </div>

      {error ? (
        <p className="feedback feedback--error" role="alert">
          {error}
        </p>
      ) : (
        <p className="feedback" aria-hidden="true">
          
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
        {loading ? "Entrando..." : "Acessar"}
      </button>
    </form>
  );
}
