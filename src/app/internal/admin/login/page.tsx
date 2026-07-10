"use client";

import { useEffect, useState } from "react";
import {
  getAdminApiBasePath,
  getAdminDashboardUrlForBrowser,
  getAdminLoginUrlForBrowser,
} from "@/lib/admin/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState({ login: "", dashboard: "" });

  useEffect(() => {
    setUrls({
      login: getAdminLoginUrlForBrowser(),
      dashboard: getAdminDashboardUrlForBrowser(),
    });
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getAdminApiBasePath()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error || "Login failed.");
        return;
      }

      window.location.assign(getAdminDashboardUrlForBrowser());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">
            Restricted access
          </p>
          <h1 className="font-serif text-3xl font-bold text-warm">Ops console</h1>
          <hr className="polygraph-line" />
        </header>

        <form onSubmit={handleSubmit} className="interrogation-card space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-ink px-4 py-3 text-warm outline-none focus:border-truth"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-border bg-ink px-4 py-3 text-warm outline-none focus:border-truth"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-lie/30 bg-lie/10 px-3 py-2 text-sm text-lie">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-truth py-3 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {urls.login && (
          <p className="text-center text-xs text-muted">
            Login URL:{" "}
            <span className="font-mono text-warm">{urls.login}</span>
            <br />
            Dashboard URL:{" "}
            <span className="font-mono text-warm">{urls.dashboard}</span>
          </p>
        )}
      </div>
    </main>
  );
}
