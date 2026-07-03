"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreateSessionId, setStoredRoomCode } from "@/lib/session";
import {
  getPusherClient,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/client";
import StatementForm from "@/components/StatementForm";
import VotePanel from "@/components/VotePanel";
import RevealPanel from "@/components/RevealPanel";
import Scoreboard from "@/components/Scoreboard";
import CopyLinkButton from "@/components/CopyLinkButton";
import type { Room, Round, RoundPublicView, Player, Vote, ScoreDelta } from "@/types/game";
import type { SubmitResponse, RoundGetSuccessResponse } from "@/types/api";

/* ===================================================================
   Game Page — /room/[code]/play

   The full game UI driven by a phase state machine:
     loading → submit / awaiting_statements / vote / awaiting_votes
            → reveal → scoreboard → (loop or finished)

   All phase transitions are driven by Pusher events, user actions, or
   timers — no polling.
   =================================================================== */

/* ---- Phase discriminated union ---- */
type PlayState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "submit";
      room: Room;
      sessionId: string;
    }
  | {
      phase: "awaiting_statements";
      room: Room;
      sessionId: string;
      submitterName: string;
    }
  | {
      phase: "vote";
      room: Room;
      round: RoundPublicView;
      sessionId: string;
      votedIndex: 0 | 1 | 2 | null;
    }
  | {
      phase: "awaiting_votes";
      room: Room;
      round: RoundPublicView;
      sessionId: string;
      votes: Vote[];
      playerCount: number;
    }
  | {
      phase: "reveal";
      room: Room;
      round: Round;
      sessionId: string;
      scoreDeltas: ScoreDelta[];
      scores: Array<{ sessionId: string; displayName: string; score: number }>;
    }
  | {
      phase: "scoreboard";
      room: Room;
      sessionId: string;
      isGameOver: boolean;
    }
  | {
      phase: "finished";
      room: Room;
      sessionId: string;
    };

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = (params?.code ?? "").toUpperCase();

  const [state, setState] = useState<PlayState>({ phase: "loading" });
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ================================================================
     Helpers
     ================================================================ */

  const getSubmitterName = useCallback(
    (room: Room, roundNumber: number): string => {
      const idx = (roundNumber - 1) % room.players.length;
      return room.players[idx]?.displayName ?? "Unknown";
    },
    []
  );

  /* ================================================================
     Initial data load
     ================================================================ */
  useEffect(() => {
    if (!roomCode) return;

    const sessionId = getOrCreateSessionId();
    setStoredRoomCode(roomCode);

    let cancelled = false;

    async function load() {
      try {
        // Fetch room
        const roomRes = await fetch(`/api/room/${encodeURIComponent(roomCode)}`);
        const roomJson = await roomRes.json();

        if (cancelled) return;

        if (!roomRes.ok || "error" in roomJson) {
          setState({
            phase: "error",
            message: "error" in roomJson ? roomJson.error : "Failed to load game.",
          });
          return;
        }

        const room: Room = roomJson.room;

        // If still in lobby, redirect
        if (room.status === "waiting") {
          router.replace(`/room/${roomCode}`);
          return;
        }

        // Game finished
        if (room.status === "finished") {
          setState({ phase: "finished", room, sessionId });
          return;
        }

        // Fetch current round
        const roundRes = await fetch(
          `/api/round/${encodeURIComponent(roomCode)}/${room.currentRound}?sessionId=${encodeURIComponent(sessionId)}`
        );

        if (cancelled) return;

        if (!roundRes.ok) {
          // Round doesn't exist yet — must be submitter's turn
          const submitterIdx = (room.currentRound - 1) % room.players.length;
          const amISubmitter = room.players[submitterIdx]?.sessionId === sessionId;

          if (amISubmitter) {
            setState({ phase: "submit", room, sessionId });
          } else {
            setState({
              phase: "awaiting_statements",
              room,
              sessionId,
              submitterName: room.players[submitterIdx]?.displayName ?? "Unknown",
            });
          }
          return;
        }

        const roundJson: RoundGetSuccessResponse = await roundRes.json();

        if (cancelled) return;

        const round = roundJson.round as Round | RoundPublicView;
        const scoreDeltas = roundJson.scoreDeltas;

        // Round is revealed → show reveal briefly then scoreboard
        if (round.revealedAt || scoreDeltas) {
          setState({
            phase: "reveal",
            room,
            round: round as Round,
            sessionId,
            scoreDeltas: scoreDeltas ?? [],
            scores: room.players.map((p) => ({
              sessionId: p.sessionId,
              displayName: p.displayName,
              score: p.score,
            })),
          });

          // Auto-advance to scoreboard after 8s
          revealTimerRef.current = setTimeout(() => {
            const nextRound = room.currentRound;
            const totalRounds = room.players.length;
            setState({
              phase: "scoreboard",
              room,
              sessionId,
              isGameOver: nextRound > totalRounds,
            });
          }, 8000);
          return;
        }

        // Round exists, not revealed
        const submitterId = round.submittedBy;
        const amISubmitter = submitterId === sessionId;
        const hasVoted = round.votes.some((v: Vote) => v.sessionId === sessionId);

        if (amISubmitter) {
          setState({
            phase: "awaiting_votes",
            room,
            round: round as RoundPublicView,
            sessionId,
            votes: round.votes,
            playerCount: room.players.length,
          });
        } else if (hasVoted) {
          setState({
            phase: "awaiting_votes",
            room,
            round: round as RoundPublicView,
            sessionId,
            votes: round.votes,
            playerCount: room.players.length,
          });
        } else {
          setState({
            phase: "vote",
            room,
            round: round as RoundPublicView,
            sessionId,
            votedIndex: null,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            phase: "error",
            message: "Network error. Check your connection and try again.",
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [roomCode, router, getSubmitterName]);

  /* ================================================================
     Pusher subscription
     ================================================================ */
  useEffect(() => {
    // Only subscribe when we're in a playing phase (not loading/error/finished)
    if (
      state.phase === "loading" ||
      state.phase === "error" ||
      state.phase === "finished"
    )
      return;

    const pusher = getPusherClient();
    const channelName = getRoomChannelName(roomCode);
    const channel = pusher.subscribe(channelName);

    /* ---- STATEMENTS_SUBMITTED ---- */
    const handleStatementsSubmitted = (data: {
      round: RoundPublicView;
      roundNumber: number;
      submittedBy: string;
    }) => {
      setState((prev) => {
        if (prev.phase === "awaiting_statements" || prev.phase === "submit") {
          return {
            phase: "vote",
            room: prev.phase === "submit" ? prev.room : prev.room,
            round: data.round,
            sessionId:
              prev.phase === "submit" ? prev.sessionId : prev.sessionId,
            votedIndex: null,
          } as PlayState;
        }
        return prev;
      });
    };

    /* ---- VOTE_CAST ---- */
    const handleVoteCast = (data: {
      sessionId: string;
      votes: Vote[];
      votesRemaining: number;
    }) => {
      setState((prev) => {
        if (prev.phase === "vote") {
          // Check if this vote was mine
          if (data.sessionId === prev.sessionId) {
            return {
              phase: "awaiting_votes",
              room: prev.room,
              round: prev.round,
              sessionId: prev.sessionId,
              votes: data.votes,
              playerCount: prev.room.players.length,
            } as PlayState;
          }
        }
        if (prev.phase === "awaiting_votes") {
          return {
            ...prev,
            votes: data.votes,
          } as PlayState;
        }
        return prev;
      });
    };

    /* ---- ROUND_REVEALED ---- */
    const handleRoundRevealed = (data: {
      round: Round;
      scoreDeltas: ScoreDelta[];
      scores: Array<{ sessionId: string; displayName: string; score: number }>;
    }) => {
      // Clear reveal timer if one is pending
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      setState((prev) => {
        if (
          prev.phase === "vote" ||
          prev.phase === "awaiting_votes" ||
          prev.phase === "awaiting_statements"
        ) {
          return {
            phase: "reveal",
            room:
              "room" in prev ? prev.room : ({} as Room), // won't happen in practice
            round: data.round,
            sessionId:
              "sessionId" in prev ? prev.sessionId : "",
            scoreDeltas: data.scoreDeltas,
            scores: data.scores,
          } as PlayState;
        }
        return prev;
      });

      // Auto-advance to scoreboard after 8s
      revealTimerRef.current = setTimeout(() => {
        setState((prev) => {
          if (prev.phase !== "reveal") return prev;
          const totalRounds = prev.room.players.length;
          return {
            phase: "scoreboard",
            room: prev.room,
            sessionId: prev.sessionId,
            isGameOver: prev.round.roundNumber >= totalRounds,
          } as PlayState;
        });
      }, 8000);
    };

    /* ---- ROUND_ROTATED ---- */
    const handleRoundRotated = (data: {
      nextRound: number;
      nextSubmitter: { sessionId: string; displayName: string };
    }) => {
      // Clear reveal timer
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      setState((prev) => {
        if (prev.phase === "reveal" || prev.phase === "scoreboard") {
          const room = prev.room;
          const amISubmitter =
            data.nextSubmitter.sessionId === prev.sessionId;
          const updatedRoom = { ...room, currentRound: data.nextRound };

          if (amISubmitter) {
            return {
              phase: "submit",
              room: updatedRoom,
              sessionId: prev.sessionId,
            } as PlayState;
          } else {
            return {
              phase: "awaiting_statements",
              room: updatedRoom,
              sessionId: prev.sessionId,
              submitterName: data.nextSubmitter.displayName,
            } as PlayState;
          }
        }
        return prev;
      });
    };

    /* ---- GAME_ENDED ---- */
    const handleGameEnded = (data: {
      scores: Array<{ sessionId: string; displayName: string; score: number }>;
    }) => {
      // Clear reveal timer
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      setState((prev) => {
        if ("room" in prev) {
          // Update player scores from the final data
          const updatedPlayers = prev.room.players.map((p) => {
            const final = data.scores.find((s) => s.sessionId === p.sessionId);
            return final ? { ...p, score: final.score } : p;
          });
          return {
            phase: "scoreboard",
            room: { ...prev.room, players: updatedPlayers, status: "finished" },
            sessionId: prev.sessionId,
            isGameOver: true,
          } as PlayState;
        }
        return prev;
      });
    };

    /* ---- PLAYER_LEFT / PLAYER_JOINED (connection status updates) ---- */
    const handleConnectionUpdate = (data: {
      players: Player[];
      playerCount: number;
    }) => {
      setState((prev) => {
        if ("room" in prev) {
          return {
            ...prev,
            room: { ...prev.room, players: data.players },
          } as PlayState;
        }
        return prev;
      });
    };

    channel.bind(PUSHER_EVENTS.STATEMENTS_SUBMITTED, handleStatementsSubmitted);
    channel.bind(PUSHER_EVENTS.VOTE_CAST, handleVoteCast);
    channel.bind(PUSHER_EVENTS.ROUND_REVEALED, handleRoundRevealed);
    channel.bind(PUSHER_EVENTS.ROUND_ROTATED, handleRoundRotated);
    channel.bind(PUSHER_EVENTS.GAME_ENDED, handleGameEnded);
    channel.bind(PUSHER_EVENTS.PLAYER_LEFT, handleConnectionUpdate);
    channel.bind(PUSHER_EVENTS.PLAYER_JOINED, handleConnectionUpdate);

    return () => {
      channel.unbind(PUSHER_EVENTS.STATEMENTS_SUBMITTED, handleStatementsSubmitted);
      channel.unbind(PUSHER_EVENTS.VOTE_CAST, handleVoteCast);
      channel.unbind(PUSHER_EVENTS.ROUND_REVEALED, handleRoundRevealed);
      channel.unbind(PUSHER_EVENTS.ROUND_ROTATED, handleRoundRotated);
      channel.unbind(PUSHER_EVENTS.GAME_ENDED, handleGameEnded);
      channel.unbind(PUSHER_EVENTS.PLAYER_LEFT, handleConnectionUpdate);
      channel.unbind(PUSHER_EVENTS.PLAYER_JOINED, handleConnectionUpdate);
      pusher.unsubscribe(channelName);
    };
  }, [state.phase, roomCode]);

  /* ================================================================
     Action handlers
     ================================================================ */

  const handleSubmit = useCallback(
    async (statements: [string, string, string], lieIndex: 0 | 1 | 2) => {
      if (state.phase !== "submit") return;

      const res = await fetch("/api/round/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          sessionId: state.sessionId,
          statements,
          lieIndex,
        }),
      });

      const json: SubmitResponse = await res.json();

      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Submit failed");
      }

      setState({
        phase: "awaiting_votes",
        room: state.room,
        round: json.round,
        sessionId: state.sessionId,
        votes: [],
        playerCount: state.room.players.length,
      });
    },
    [state, roomCode]
  );

  const handleVote = useCallback(
    async (votedIndex: 0 | 1 | 2) => {
      if (state.phase !== "vote") return;

      const res = await fetch("/api/round/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          roundNumber: state.round.roundNumber,
          sessionId: state.sessionId,
          votedIndex,
        }),
      });

      const json = await res.json();

      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Vote failed");
      }

      setState({
        phase: "awaiting_votes",
        room: state.room,
        round: state.round,
        sessionId: state.sessionId,
        votes: [], // will be updated by VOTE_CAST events
        playerCount: state.room.players.length,
      });
    },
    [state, roomCode]
  );

  const handleScoreboardContinue = useCallback(() => {
    // Clear pending timers
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (state.phase !== "scoreboard") return;

    if ((state as { isGameOver: boolean }).isGameOver) {
      setState({ phase: "finished", room: state.room, sessionId: state.sessionId });
    }
    // Otherwise wait for ROUND_ROTATED event
  }, [state]);

  const handlePlayAgain = useCallback(() => {
    router.push("/");
  }, [router]);

  /* ================================================================
     Cleanup on unmount
     ================================================================ */
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  /* ================================================================
     RENDER
     ================================================================ */

  /* ---- Loading ---- */
  if (state.phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="skeleton mx-auto h-4 w-48" />
            <div className="skeleton mx-auto h-4 w-32" />
          </div>
          <div className="skeleton mx-auto h-12 w-24 rounded-full" />
          <div className="skeleton mx-auto h-8 w-72" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* ---- Error ---- */
  if (state.phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-warm">
          Something went wrong
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

  /* ---- Shared layout wrapper ---- */
  const renderHeader = (room: Room) => (
    <header className="text-center space-y-1">
      <div className="flex items-center justify-center gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">
          Case file{" "}
          <span className="font-mono text-warm">{room.roomCode}</span>
        </p>
        <CopyLinkButton roomCode={room.roomCode} variant="compact" />
      </div>
      <p className="text-xs text-muted/60">
        Round {room.currentRound} of {room.players.length}
      </p>
    </header>
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* ---- Player status bar ---- */}
        {("room" in state) && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {state.room.players.map((p: Player) => (
                <span
                  key={p.sessionId}
                  className={
                    "mr-3 inline-flex items-center gap-1 " +
                    (p.sessionId === state.sessionId ? "text-truth" : "")
                  }
                >
                  <span
                    className={
                      "inline-block h-1.5 w-1.5 rounded-full " +
                      (p.connected ? "bg-truth" : "bg-lie")
                    }
                  />
                  {p.displayName}
                  {p.sessionId === state.sessionId ? " (you)" : ""}
                  {" · "}
                  {p.score}pt
                </span>
              ))}
            </span>
          </div>
        )}

        {/* ---- Phase-specific content ---- */}
        {state.phase === "submit" && (
          <div className="animate-fade-in-up space-y-6" key="submit">
            {renderHeader(state.room)}
            <StatementForm onSubmit={handleSubmit} loading={false} />
          </div>
        )}

        {state.phase === "awaiting_statements" && (
          <div className="animate-fade-in-up space-y-6" key="awaiting_statements">
            {renderHeader(state.room)}
            <div className="interrogation-card text-center space-y-4">
              <h2 className="font-serif text-lg font-semibold text-warm">
                Awaiting statements
              </h2>
              <hr className="polygraph-line" />
              <p className="text-muted">
                <span className="font-semibold text-warm">
                  {state.submitterName}
                </span>{" "}
                is writing their two truths and a lie…
              </p>
              <div className="flex justify-center gap-1 py-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {state.phase === "vote" && (
          <div className="animate-fade-in-up space-y-6" key="vote">
            {renderHeader(state.room)}
            <VotePanel
              statements={state.round.statements}
              submittedBy={getSubmitterName(state.room, state.round.roundNumber)}
              votes={state.round.votes}
              playerCount={state.room.players.length}
              onVote={handleVote}
              hasVoted={false}
              votedIndex={state.votedIndex}
            />
          </div>
        )}

        {state.phase === "awaiting_votes" && (
          <div className="animate-fade-in-up space-y-6" key="awaiting_votes">
            {renderHeader(state.room)}
            <div className="interrogation-card text-center space-y-4">
              <h2 className="font-serif text-lg font-semibold text-warm">
                Votes are in progress
              </h2>
              <hr className="polygraph-line" />
              <p className="text-muted">
                {state.votes.length} of {state.playerCount - 1} votes cast.
                Waiting for the rest…
              </p>
              <div className="flex justify-center gap-1 py-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block h-2 w-2 animate-pulse rounded-full bg-truth"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
              {/* Show statements submitted */}
              <div className="space-y-2 pt-2 text-left">
                {(state.round as RoundPublicView).statements.map(
                  (stmt: string, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-ink/50 px-4 py-2 font-mono text-sm text-muted"
                    >
                      <span className="mr-2 text-xs text-muted/60">
                        {i + 1}.
                      </span>
                      {stmt}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {state.phase === "reveal" && (
          <div className="animate-fade-in-up space-y-6" key="reveal">
            {renderHeader(state.room)}
            <RevealPanel
              statements={state.round.statements}
              lieIndex={state.round.lieIndex}
              scoreDeltas={state.scoreDeltas}
              scores={state.scores}
              currentPlayerSessionId={state.sessionId}
              votes={state.round.votes}
              players={state.room.players.map((p: Player) => ({
                sessionId: p.sessionId,
                displayName: p.displayName,
              }))}
            />
            <p className="text-center text-xs text-muted/60">
              Auto-advancing in a few seconds…
            </p>
          </div>
        )}

        {state.phase === "scoreboard" && (
          <div className="animate-fade-in-up space-y-6" key="scoreboard">
            <Scoreboard
              players={state.room.players}
              currentRound={state.room.currentRound}
              totalRounds={state.room.players.length}
              isGameOver={(state as { isGameOver: boolean }).isGameOver}
              currentPlayerSessionId={state.sessionId}
              onContinue={handleScoreboardContinue}
              onPlayAgain={handlePlayAgain}
            />
          </div>
        )}

        {state.phase === "finished" && (
          <div className="animate-fade-in-up space-y-6" key="finished">
            <Scoreboard
              players={state.room.players}
              currentRound={state.room.players.length}
              totalRounds={state.room.players.length}
              isGameOver={true}
              currentPlayerSessionId={state.sessionId}
              onContinue={() => {}}
              onPlayAgain={handlePlayAgain}
            />
          </div>
        )}
      </div>
    </main>
  );
}
