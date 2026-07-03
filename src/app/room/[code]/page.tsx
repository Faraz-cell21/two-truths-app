"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreateSessionId, setStoredRoomCode } from "@/lib/session";
import {
  getPusherClient,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/client";
import PlayerSlot from "@/components/PlayerSlot";
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
  const gameStartedRef = useRef(false);

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
            message: "error" in json ? json.error : "Failed to load room.",
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
    }) => {
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

    const handlePlayerLeft = (data: {
      players: Player[];
      playerCount: number;
    }) => {
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

  /* ===================================================================
     RENDER
     =================================================================== */

  /* ---- Loading ---- */
  if (state.phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-sm text-muted animate-pulse">
          Accessing case file…
        </p>
      </main>
    );
  }

  /* ---- Error ---- */
  if (state.phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-warm">
          Case file not found
        </h1>
        <hr className="polygraph-line max-w-xs" />
        <p className="text-muted">{state.message}</p>
        <a
          href="/"
          className="rounded-lg border border-border px-6 py-2 font-medium text-warm transition-colors hover:border-muted"
        >
          Back to headquarters
        </a>
      </main>
    );
  }

  /* ---- Active or Starting (both share the same layout) ---- */
  const room = state.room;
  const sessionId = state.phase === "active" ? state.sessionId : "";
  const isStarting = state.phase === "starting";
  const playerCount = room.players.length;
  const slots: (Player | null)[] = Array.from(
    { length: room.targetSize },
    (_, i) => room.players[i] ?? null
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
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
        </header>

        {/* ---- Room code ---- */}
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">
            Case file #
          </p>
          <button
            onClick={copyRoomCode}
            className="group inline-flex items-center gap-3 font-mono text-3xl font-bold tracking-wider text-warm transition-colors hover:text-truth"
            title="Click to copy"
          >
            <span>{room.roomCode}</span>
            <span className="text-sm text-muted opacity-0 transition-opacity group-hover:opacity-100">
              📋
            </span>
          </button>
          <p className="text-xs text-muted/60">
            Share this code with the other players
          </p>
        </div>

        {/* ---- Player slots ---- */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.3em] text-muted">
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
