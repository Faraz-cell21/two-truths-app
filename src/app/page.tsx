"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getOrCreateSessionId,
  getStoredDisplayName,
  setStoredDisplayName,
  setStoredRoomCode,
} from "@/lib/session";
import type { JoinResponse, JoinAction } from "@/types/api";
import type { TargetSize } from "@/types/game";

/* ===================================================================
   Home Page — entry point for the app.
   Player sets their display name, then either:
     • Plays random matchmaking (auto-finds a room of chosen size)
     • Creates a private room (gets a code to share)
     • Joins an existing private room by code
   =================================================================== */

type PageState =
  | { phase: "idle" }
  | { phase: "loading"; action: string }
  | { phase: "error"; message: string };

export default function HomePage() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [targetSize, setTargetSize] = useState<TargetSize>(3);
  const [roomCode, setRoomCode] = useState<string>("");
  const [state, setState] = useState<PageState>({ phase: "idle" });

  // Hydrate from localStorage on mount (SSR-safe: state lives in useEffect)
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    const stored = getStoredDisplayName();
    if (stored) setDisplayName(stored);
  }, []);

  /* ---- shared join handler ---- */
  const join = useCallback(
    async (action: JoinAction, overrides?: { targetSize?: TargetSize; roomCode?: string }) => {
      const name = displayName.trim();
      if (!name) {
        setState({ phase: "error", message: "Enter a display name first." });
        return;
      }

      setStoredDisplayName(name);
      const size = overrides?.targetSize ?? targetSize;

      const label =
        action === "random"
          ? "Finding a game…"
          : action === "create-private"
            ? "Creating room…"
            : "Joining room…";

      setState({ phase: "loading", action: label });

      try {
        const body: Record<string, unknown> = {
          action,
          sessionId,
          displayName: name,
        };
        if (action === "random" || action === "create-private") {
          body.targetSize = size;
        }
        if (action === "join-private") {
          body.roomCode = overrides?.roomCode ?? roomCode;
        }

        const res = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json: JoinResponse = await res.json();

        if (!res.ok || "error" in json) {
          setState({
            phase: "error",
            message: "error" in json ? json.error : "Something went wrong.",
          });
          return;
        }

        setStoredRoomCode(json.room.roomCode);
        router.push(`/room/${json.room.roomCode}`);
      } catch {
        setState({
          phase: "error",
          message: "Network error. Check your connection and try again.",
        });
      }
    },
    [displayName, sessionId, targetSize, roomCode, router]
  );

  const isLoading = state.phase === "loading";

  /* ---- render ---- */
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* ---- Headline ---- */}
        <header className="text-center space-y-3">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-warm">
            Two Truths
            <br />
            <span className="text-muted">&amp; a Lie</span>
          </h1>
          <hr className="polygraph-line" />
          <p className="text-sm text-muted">
            One player lies. Everyone else detects.
          </p>
        </header>

        {/* ---- Display name ---- */}
        <section className="interrogation-card space-y-3">
          <label className="block text-sm font-medium text-muted uppercase tracking-widest">
            Your alias
          </label>
          <input
            type="text"
            maxLength={30}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (state.phase === "error") setState({ phase: "idle" });
            }}
            placeholder="Detective…"
            className="w-full rounded-lg border border-border bg-ink px-4 py-3 font-mono text-sm text-warm placeholder:text-muted/50 focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
            disabled={isLoading}
            autoFocus
          />
          {state.phase === "error" && (
            <p className="text-sm text-lie" role="alert">
              {state.message}
            </p>
          )}
        </section>

        {/* ---- Random matchmaking ---- */}
        <section className="interrogation-card space-y-4">
          <h2 className="font-serif text-lg font-semibold text-warm">
            Random matchmaking
          </h2>
          <p className="text-sm text-muted">
            Join a public room. We will match you with strangers.
          </p>

          {/* Target size picker */}
          <div className="flex gap-2">
            {([2, 3, 4, 5] as TargetSize[]).map((n) => (
              <button
                key={n}
                onClick={() => setTargetSize(n)}
                disabled={isLoading}
                className={
                  "flex-1 rounded-lg border px-3 py-2 font-mono text-sm transition-colors " +
                  (targetSize === n
                    ? "border-truth bg-truth/10 text-truth"
                    : "border-border text-muted hover:border-muted")
                }
              >
                {n}p
              </button>
            ))}
          </div>

          <button
            onClick={() => join("random")}
            disabled={isLoading}
            className="w-full rounded-lg bg-truth py-3 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {state.phase === "loading" && state.action === "Finding a game…"
              ? "Finding a game…"
              : "Play — find a room"}
          </button>
        </section>

        {/* ---- Divider ---- */}
        <div className="flex items-center gap-4">
          <hr className="flex-1 border-border" />
          <span className="text-xs uppercase tracking-widest text-muted">or</span>
          <hr className="flex-1 border-border" />
        </div>

        {/* ---- Private room ---- */}
        <section className="interrogation-card space-y-4">
          <h2 className="font-serif text-lg font-semibold text-warm">
            Private room
          </h2>
          <p className="text-sm text-muted">
            Create a room and share the code with friends.
          </p>

          <div className="flex gap-2">
            {([2, 3, 4, 5] as TargetSize[]).map((n) => (
              <button
                key={n}
                onClick={() => setTargetSize(n)}
                disabled={isLoading}
                className={
                  "flex-1 rounded-lg border px-3 py-2 font-mono text-sm transition-colors " +
                  (targetSize === n
                    ? "border-truth bg-truth/10 text-truth"
                    : "border-border text-muted hover:border-muted")
                }
              >
                {n}p
              </button>
            ))}
          </div>

          <button
            onClick={() => join("create-private")}
            disabled={isLoading}
            className="w-full rounded-lg border border-truth py-3 font-semibold text-truth transition-colors hover:bg-truth/10 disabled:opacity-50"
          >
            {state.phase === "loading" && state.action === "Creating room…"
              ? "Creating room…"
              : "Create private room"}
          </button>

          {/* ---- Join by code ---- */}
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted">
              Already have a code? Enter it below.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  if (state.phase === "error") setState({ phase: "idle" });
                }}
                placeholder="BLUE-FOX-42"
                maxLength={14}
                className="flex-1 rounded-lg border border-border bg-ink px-4 py-3 font-mono text-sm uppercase text-warm placeholder:text-muted/50 focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={() => join("join-private")}
                disabled={isLoading || !roomCode.trim()}
                className="rounded-lg bg-card border border-border px-5 py-3 font-semibold text-warm transition-colors hover:border-muted disabled:opacity-40"
              >
                Join
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
