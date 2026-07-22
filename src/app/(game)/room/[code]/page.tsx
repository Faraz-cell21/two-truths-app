"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getOrCreateSessionId, setStoredRoomCode, clearStoredRoomCode } from "@/lib/session";
import {
  getPusherClient,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/client";
import PlayerSlot from "@/components/PlayerSlot";
import CopyLinkButton from "@/components/CopyLinkButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useGameScenePhase } from "@/components/three/useGameScenePhase";
import type { Room, Player } from "@/types/game";

/* ===================================================================
   Lobby Page — /room/[code]

   Shows the room code, waiting players, and the target size. Subscribes
   to Pusher for real-time updates (players joining/leaving, game start)
   and auto-transitions to gameplay when the room fills and starts.
   =================================================================== */

type LobbyState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "active"; room: Room; sessionId: string }
  | { phase: "starting"; room: Room };

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();

  // Room code comes from the URL — it's stable for the lifetime of this
  // page, so we use it directly for channel names and navigation rather
  // than threading it through state.
  const roomCode = (params?.code ?? "").toUpperCase();

  const [state, setState] = useState<LobbyState>({ phase: "loading" });
  const [notification, setNotification] = useState<string | null>(null);
  const gameStartedRef = useRef(false);
  const sessionIdRef = useRef<string>("");

  /* ---- Leave lobby ---- */
  const handleLeave = useCallback(async () => {
    const sid = sessionIdRef.current || getOrCreateSessionId();
    try {
      await fetch(`/api/room/${encodeURIComponent(roomCode)}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          disconnectedAt: Date.now(),
          reason: "explicit",
        }),
      });
    } catch {
      // Best-effort — navigate away regardless
    }
    clearStoredRoomCode();
    router.push("/");
  }, [roomCode, router]);

  // Fire leave on tab close
  useEffect(() => {
    const sid = getOrCreateSessionId();
    sessionIdRef.current = sid;

    const handleBeforeUnload = () => {
      const payload = new Blob(
        [
          JSON.stringify({
            sessionId: sid,
            disconnectedAt: Date.now(),
            reason: "unload",
          }),
        ],
        { type: "application/json" }
      );
      navigator.sendBeacon(
        `/api/room/${encodeURIComponent(roomCode)}/leave`,
        payload
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomCode]);

  /* ---- Initial room-state fetch ---- */
  useEffect(() => {
    if (!roomCode) return;

    const sessionId = getOrCreateSessionId();
    setStoredRoomCode(roomCode);

    let cancelled = false;

    async function fetchRoom() {
      try {
        const res = await fetch(`/api/room/${encodeURIComponent(roomCode)}`);
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || "error" in json) {
          setState({
            phase: "error",
            message:
              res.status === 410
                ? "This lobby expired because no one joined in time."
                : "error" in json
                  ? json.error
                  : "Failed to load room.",
          });
          return;
        }

        // If the game already started (e.g. reconnecting mid-game), show
        // "starting" so the player isn't stuck in the lobby.
        if (json.room.status !== "waiting") {
          setState({ phase: "starting", room: json.room });
          return;
        }

        setState({ phase: "active", room: json.room, sessionId });
      } catch {
        if (!cancelled) {
          setState({
            phase: "error",
            message: "Network error. Check your connection and try again.",
          });
        }
      }
    }

    fetchRoom();
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  /* ---- Pusher subscription (only while in "active" lobby phase) ---- */
  useEffect(() => {
    if (state.phase !== "active") return;

    const pusher = getPusherClient();
    const channelName = getRoomChannelName(roomCode);
    const channel = pusher.subscribe(channelName);

    const handlePlayerJoined = (data: {
      players: Player[];
      playerCount: number;
      targetSize: number;
      expiresAt?: string;
    }) => {
      setState((prev) => {
        if (prev.phase !== "active") return prev;
        return {
          ...prev,
          room: {
            ...prev.room,
            players: data.players,
            ...(data.expiresAt ? { expiresAt: data.expiresAt } : {}),
          },
        };
      });
    };

    const handlePlayerLeft = (data: {
      sessionId: string;
      displayName?: string;
      players: Player[];
      playerCount: number;
    }) => {
      if (data.displayName) {
        setNotification(`${data.displayName} left the lobby`);
        setTimeout(() => setNotification(null), 4000);
      }
      setState((prev) => {
        if (prev.phase !== "active") return prev;
        return {
          ...prev,
          room: {
            ...prev.room,
            players: data.players,
          },
        };
      });
    };

    const handleGameStarted = () => {
      if (gameStartedRef.current) return;
      gameStartedRef.current = true;

      setState((prev) => {
        if (prev.phase !== "active") return prev;
        return {
          phase: "starting",
          room: { ...prev.room, status: "playing" },
        };
      });
    };

    channel.bind(PUSHER_EVENTS.PLAYER_JOINED, handlePlayerJoined);
    channel.bind(PUSHER_EVENTS.PLAYER_LEFT, handlePlayerLeft);
    channel.bind(PUSHER_EVENTS.GAME_STARTED, handleGameStarted);

    return () => {
      channel.unbind(PUSHER_EVENTS.PLAYER_JOINED, handlePlayerJoined);
      channel.unbind(PUSHER_EVENTS.PLAYER_LEFT, handlePlayerLeft);
      channel.unbind(PUSHER_EVENTS.GAME_STARTED, handleGameStarted);
      pusher.unsubscribe(channelName);
    };
  }, [state.phase, roomCode]);

  /* ---- Copy room code to clipboard ---- */
  const copyRoomCode = useCallback(async () => {
    if (state.phase !== "active" && state.phase !== "starting") return;
    try {
      await navigator.clipboard.writeText(
        state.phase === "active" ? state.room.roomCode : state.room.roomCode
      );
    } catch {
      // Clipboard API not available — ignore silently
    }
  }, [state]);

  /* ---- Transition to game on GAME_STARTED ---- */
  useEffect(() => {
    if (state.phase !== "starting") return;
    const timer = setTimeout(() => {
      router.push(`/room/${roomCode}/play`);
    }, 1200); // brief pause so the player sees "game starting" feedback
    return () => clearTimeout(timer);
  }, [state.phase, roomCode, router]);

  /* ---- Auto-start when lobby is full (e.g. after play-again reset) ---- */
  const autoStartFiredRef = useRef(false);

  useEffect(() => {
    if (state.phase !== "active") return;
    const players = state.room.players;
    const targetSize = state.room.targetSize;
    const connectedPlayers = players.filter((p) => p.connected);
    if (connectedPlayers.length < targetSize) return;
    if (autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;

    fetch(`/api/room/${encodeURIComponent(roomCode)}/start`, {
      method: "POST",
    });
  }, [state.phase, roomCode, state]);

  /* ---- Lobby idle countdown / expiry ---- */
  const [lobbySecondsLeft, setLobbySecondsLeft] = useState<number | null>(null);
  const lobbyExpiresAtIso =
    state.phase === "active" ? state.room.expiresAt : null;

  useEffect(() => {
    if (state.phase !== "active" || !lobbyExpiresAtIso) {
      // Reset the countdown when there is no active lobby deadline to track.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived timer state on phase change
      setLobbySecondsLeft(null);
      return;
    }

    const expiresMs = Date.parse(lobbyExpiresAtIso);
    if (!Number.isFinite(expiresMs)) return;

    let cancelled = false;

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
      if (cancelled) return;
      setLobbySecondsLeft(remaining);

      if (remaining <= 0) {
        clearStoredRoomCode();
        try {
          await fetch(`/api/room/${encodeURIComponent(roomCode)}`);
        } catch {
          // Best-effort server delete via GET expiry check
        }
        if (!cancelled) {
          setState({
            phase: "error",
            message: "This lobby expired because no one joined in time.",
          });
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.phase, lobbyExpiresAtIso, roomCode]);

  const lobbyScenePhase =
    state.phase === "loading"
      ? "loading"
      : state.phase === "error"
        ? "error"
        : "lobby";
  useGameScenePhase(lobbyScenePhase);

  /* ===================================================================
     RENDER
     =================================================================== */

  /* ---- Loading ---- */
  if (state.phase === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="skeleton mx-auto h-8 w-64" />
            <div className="skeleton mx-auto h-0.5 w-48" />
            <div className="skeleton mx-auto h-4 w-56" />
          </div>
          <div className="skeleton mx-auto h-12 w-80" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* ---- Error ---- */
  if (state.phase === "error") {
    const expired = state.message.toLowerCase().includes("expired");
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-warm">
          {expired ? "Lobby expired" : "Case file not found"}
        </h1>
        <hr className="polygraph-line max-w-xs" />
        <p className="text-muted">{state.message}</p>
        <Link
          href="/"
          className="rounded-lg border border-border px-6 py-2 font-medium text-warm transition-colors hover:border-muted"
        >
          Back to headquarters
        </Link>
      </main>
    );
  }

  /* ---- Active or Starting (both share the same layout) ---- */
  const room = state.room;
  const sessionId = state.phase === "active" ? state.sessionId : "";
  const isStarting = state.phase === "starting";
  const connectedPlayers = room.players.filter((p) => p.connected);
  const playerCount = connectedPlayers.length;
  const slots: (Player | null)[] = Array.from(
    { length: room.targetSize },
    (_, i) => connectedPlayers[i] ?? null
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start px-4 py-12">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={handleLeave}
          className="leave-action"
          title="Leave lobby"
        >
          Leave lobby
        </button>
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-lg space-y-8">
        {/* ---- Notification banner ---- */}
        {notification && (
          <div className="animate-fade-in-up rounded-lg border border-truth/30 bg-truth/5 px-4 py-3 text-center text-sm text-warm">
            {notification}
          </div>
        )}

        {/* ---- Headline ---- */}
        <header className="text-center space-y-3">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-warm">
            {isStarting ? "Case begins" : "The briefing room"}
          </h1>
          <hr className="polygraph-line" />
          <p className="text-sm text-muted">
            {isStarting
              ? "Statements incoming. Prepare your interrogation."
              : `${playerCount} of ${room.targetSize} detectives present. Waiting for the rest.`}
          </p>
          {!isStarting && lobbySecondsLeft !== null && (
            <p
              className={
                "font-mono text-xs tabular-nums tracking-wide " +
                (lobbySecondsLeft <= 60 ? "text-lie" : "text-muted")
              }
            >
              Lobby closes in {Math.floor(lobbySecondsLeft / 60)}:
              {String(lobbySecondsLeft % 60).padStart(2, "0")}
            </p>
          )}
        </header>

        {/* ---- Room code ---- */}
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-warm/80">
            Case file #
          </p>
          <div className="inline-flex items-center gap-2.5">
            <button
              type="button"
              onClick={copyRoomCode}
              className="font-mono text-3xl font-bold tracking-wider text-warm transition-colors hover:text-truth"
              title="Click to copy room code"
            >
              {room.roomCode}
            </button>
            <CopyLinkButton roomCode={room.roomCode} />
          </div>
          <p className="text-xs text-muted/85">
            Share this code or the invite link with the other players
          </p>
        </div>

        {/* ---- Player slots ---- */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.3em] text-warm/80">
            Subjects present
          </h2>
          <div className="space-y-3">
            {slots.map((player, i) => (
              <PlayerSlot
                key={player?.sessionId ?? `empty-${i}`}
                player={player}
                isSelf={player?.sessionId === sessionId}
                index={i}
              />
            ))}
          </div>
        </section>

        {/* ---- Starting indicator ---- */}
        {isStarting && (
          <div className="text-center space-y-4 animate-pulse">
            <hr className="polygraph-line" />
            <p className="font-mono text-lg font-semibold text-truth">
              Game starting…
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
