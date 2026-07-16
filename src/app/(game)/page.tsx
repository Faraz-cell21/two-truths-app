"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getOrCreateSessionId,
  getStoredDisplayName,
  setStoredDisplayName,
  setStoredRoomCode,
  getStoredRoomCode,
  clearStoredRoomCode,
} from "@/lib/session";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useGameScenePhase } from "@/components/three/useGameScenePhase";
import type { JoinResponse, JoinAction } from "@/types/api";
import type { Room, TargetSize } from "@/types/game";

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

type RejoinState =
  | { phase: "checking" }
  | { phase: "found"; room: Room }
  | { phase: "none" };

export default function HomePage() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [randomTargetSize, setRandomTargetSize] = useState<TargetSize>(3);
  const [privateTargetSize, setPrivateTargetSize] = useState<TargetSize>(3);
  const [roomCode, setRoomCode] = useState<string>("");
  const [state, setState] = useState<PageState>({ phase: "idle" });
  const [rejoin, setRejoin] = useState<RejoinState>({ phase: "checking" });

  // Hydrate from localStorage on mount (SSR-safe: state lives in useEffect)
  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);
    const stored = getStoredDisplayName();
    if (stored) setDisplayName(stored);

    // Check if there's an active room to rejoin
    const storedCode = getStoredRoomCode();
    if (storedCode) {
      checkRejoin(sid, storedCode);
    } else {
      setRejoin({ phase: "none" });
    }
  }, []);

  /* ---- rejoin check ---- */
  const checkRejoin = useCallback(
    async (sid: string, code: string) => {
      try {
        const res = await fetch(`/api/room/${encodeURIComponent(code)}/rejoin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        });
        if (!res.ok) {
          // Room expired or player not in it — clear stale data
          clearStoredRoomCode();
          setRejoin({ phase: "none" });
          return;
        }
        const json = await res.json();
        setRejoin({ phase: "found", room: json.room });
      } catch {
        setRejoin({ phase: "none" });
      }
    },
    []
  );

  const handleRejoin = useCallback(() => {
    if (rejoin.phase !== "found") return;
    const room = rejoin.room;
    router.push(
      room.status === "waiting"
        ? `/room/${room.roomCode}`
        : `/room/${room.roomCode}/play`
    );
  }, [rejoin, router]);

  const handleDismissRejoin = useCallback(() => {
    clearStoredRoomCode();
    setRejoin({ phase: "none" });
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
        if (action === "random") {
          body.targetSize = randomTargetSize;
        } else if (action === "create-private") {
          body.targetSize = privateTargetSize;
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
    [displayName, sessionId, randomTargetSize, privateTargetSize, roomCode, router]
  );

  const isLoading = state.phase === "loading";
  useGameScenePhase(isLoading ? "loading" : "home");

  /* ---- render ---- */
  return (
    <main className="flex min-h-dvh flex-col items-center justify-start px-4 py-12">
      {/* Theme toggle — top-right */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-md space-y-8">
        {/* ---- Headline ---- */}
        <header className="text-center space-y-3">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-warm">
            Two Truths
            <br />
            <span className="text-lie/90">&amp; a Lie</span>
          </h1>
          <hr className="polygraph-line" />
          <p className="text-sm font-bold">
            One player lies. Everyone else detects.
          </p>
        </header>

        {/* ---- Rejoin banner ---- */}
        {rejoin.phase === "found" && (
          <section className="interrogation-card border-truth/40 bg-truth/5 space-y-3">
            <p className="text-sm text-warm">
              You have an active game in{" "}
              <span className="font-mono font-bold text-truth">
                {rejoin.room.roomCode}
              </span>
              {rejoin.room.status === "waiting"
                ? " (waiting in the lobby)"
                : " (round " + rejoin.room.currentRound + " in progress)"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRejoin}
                className="flex-1 rounded-lg bg-truth py-2 font-semibold text-ink transition-opacity hover:opacity-90"
              >
                Rejoin game
              </button>
              <button
                onClick={handleDismissRejoin}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-muted"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* ---- Display name ---- */}
        <section className="interrogation-card space-y-3">
          <label className="block text-sm font-semibold uppercase tracking-widest text-warm">
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
            className="w-full rounded-lg border border-border bg-field px-4 py-3 font-mono text-sm text-warm placeholder:text-muted focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
            disabled={isLoading}
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
                onClick={() => setRandomTargetSize(n)}
                disabled={isLoading}
                className={
                  "flex-1 rounded-lg border px-3 py-2 font-mono text-sm transition-colors " +
                  (randomTargetSize === n
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
              : "Find a room"}
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
                onClick={() => setPrivateTargetSize(n)}
                disabled={isLoading}
                className={
                  "flex-1 rounded-lg border px-3 py-2 font-mono text-sm transition-colors " +
                  (privateTargetSize === n
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
                className="flex-1 rounded-lg border border-border bg-field px-4 py-3 font-mono text-sm uppercase text-warm placeholder:text-muted focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
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

        {/* ---- How to Play ---- */}
        <details className="interrogation-card cursor-pointer group">
          <summary className="text-sm font-semibold uppercase tracking-widest text-warm list-none flex items-center justify-between">
            How to play
            <span className="text-muted text-xs transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
            <p>
              <span className="font-semibold text-warm">1. Join or create</span>{" "}
              a room and choose your size (2-5 players). Share the code with
              friends, or hop into a random match.
            </p>
            <p>
              <span className="font-semibold text-warm">2. Each round,</span>{" "}
              one player writes three statements: two truths and one lie.
              Mark the lie before submitting.
            </p>
            <p>
              <span className="font-semibold text-warm">3. Everyone else</span>{" "}
              votes on which statement they think is the lie. You have 30
              seconds — if time runs out with no vote, it counts as wrong.
            </p>
            <p>
              <span className="font-semibold text-warm">4. Scoring:</span> +1
              point for guessing the lie correctly. +1 point to the writer for
              each player they fooled (including anyone who didn&apos;t vote in
              time).
            </p>
            <p>
              <span className="font-semibold text-warm">5. After everyone</span>{" "}
              has had a turn submitting, the detective with the most points wins
              the case. Finished rooms are removed after about 30 minutes if
              nobody plays again.
            </p>
            <p>
              <span className="font-semibold text-warm">Lobbies:</span> random
              rooms close after 5 minutes if they don&apos;t fill; private rooms
              after 10 minutes.
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
