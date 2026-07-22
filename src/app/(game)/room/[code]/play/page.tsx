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
import StatementForm from "@/components/StatementForm";
import AwaitingStatements from "@/components/AwaitingStatements";
import VotePanel, { type VoteResult } from "@/components/VotePanel";
import RevealPanel from "@/components/RevealPanel";
import Scoreboard from "@/components/Scoreboard";
import CopyLinkButton from "@/components/CopyLinkButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import PlayerAvatar from "@/components/PlayerAvatar";
import { useGameScenePhase } from "@/components/three/useGameScenePhase";
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
      round: RoundPublicView | Round;
      sessionId: string;
      votes: Vote[];
      playerCount: number;
      votedIndex: 0 | 1 | 2 | null;
      lieIndex: 0 | 1 | 2 | null;
      voteResults: VoteResult[];
      isSubmitter: boolean;
      allVotesIn: boolean;
      pendingReveal: {
        round: Round;
        scoreDeltas: ScoreDelta[];
        scores: Array<{ sessionId: string; displayName: string; score: number }>;
      } | null;
      pendingRotation: {
        nextRound: number;
        nextSubmitter: { sessionId: string; displayName: string };
      } | null;
    }
  | {
      phase: "reveal";
      room: Room;
      round: Round;
      sessionId: string;
      scoreDeltas: ScoreDelta[];
      scores: Array<{ sessionId: string; displayName: string; score: number }>;
      pendingRotation: {
        nextRound: number;
        nextSubmitter: { sessionId: string; displayName: string };
      } | null;
    }
  | {
      phase: "scoreboard";
      room: Room;
      sessionId: string;
      isGameOver: boolean;
      gameEndReason?: string;
      pendingRotation: {
        nextRound: number;
        nextSubmitter: { sessionId: string; displayName: string };
      } | null;
    }
  | {
      phase: "finished";
      room: Room;
      sessionId: string;
      gameEndReason?: string;
    };

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = (params?.code ?? "").toUpperCase();

  const [state, setState] = useState<PlayState>({ phase: "loading" });
  const [notification, setNotification] = useState<string | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abandonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string>("");
  const stateRef = useRef(state);
  // Keep a ref to the latest state for async timer callbacks (e.g. the vote
  // timeout). Updated post-commit so we never read refs during render.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useGameScenePhase(state.phase);

  /* ---- Leave ---- */
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
      // Best-effort
    }
    clearStoredRoomCode();
    router.push("/");
  }, [roomCode, router]);

  // Soft-leave on tab close / refresh (server grants a reconnect grace window).
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
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
    };
  }, [roomCode]);

  /** If the room finished while we were waiting, jump to the scoreboard. */
  const applyFinishedRoom = useCallback(
    (
      room: Room,
      reason?: string
    ) => {
      const sid = sessionIdRef.current || getOrCreateSessionId();
      setState({
        phase: "scoreboard",
        room: { ...room, status: "finished" },
        sessionId: sid,
        isGameOver: true,
        gameEndReason: reason ?? "not-enough-players",
        pendingRotation: null,
      });
    },
    []
  );

  const pollRoomForAbandon = useCallback(async () => {
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(roomCode)}`);
      const json = await res.json();
      if (!res.ok || !json.room) return;
      if (json.room.status === "finished") {
        applyFinishedRoom(json.room);
      } else {
        setState((prev) => {
          if (!("room" in prev)) return prev;
          if (prev.phase === "finished" || prev.phase === "scoreboard") {
            return prev;
          }
          return {
            ...prev,
            room: { ...prev.room, ...json.room, players: json.room.players },
          } as PlayState;
        });
      }
    } catch {
      // ignore transient errors
    }
  }, [roomCode, applyFinishedRoom]);

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

  const buildVoteResult = useCallback(
    (
      room: Room,
      sessionId: string,
      votedIndex: 0 | 1 | 2,
      isCorrect: boolean
    ): VoteResult => ({
      sessionId,
      displayName:
        room.players.find((p) => p.sessionId === sessionId)?.displayName ??
        "Unknown",
      votedIndex,
      isCorrect,
    }),
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
        // Rejoin before reading state so a refresh doesn't keep us
        // disconnected (and so the reconnect grace window is cleared).
        const rejoinRes = await fetch(
          `/api/room/${encodeURIComponent(roomCode)}/rejoin`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          }
        );
        const rejoinJson = await rejoinRes.json();

        if (cancelled) return;

        if (rejoinRes.status === 410) {
          // Game already ended (including after an expired reconnect grace).
          const roomRes = await fetch(
            `/api/room/${encodeURIComponent(roomCode)}`
          );
          const roomJson = await roomRes.json();
          if (cancelled) return;
          if (roomRes.ok && roomJson.room) {
            setState({
              phase: "finished",
              room: roomJson.room,
              sessionId,
              gameEndReason: "not-enough-players",
            });
          } else {
            setState({
              phase: "error",
              message:
                "error" in rejoinJson
                  ? rejoinJson.error
                  : "This game has already ended.",
            });
          }
          return;
        }

        // Fetch room (prefer rejoin payload when available)
        const room: Room =
          rejoinRes.ok && rejoinJson.room
            ? rejoinJson.room
            : (
                await (async () => {
                  const roomRes = await fetch(
                    `/api/room/${encodeURIComponent(roomCode)}`
                  );
                  const roomJson = await roomRes.json();
                  if (!roomRes.ok || "error" in roomJson) {
                    throw new Error(
                      "error" in roomJson
                        ? roomJson.error
                        : "Failed to load game."
                    );
                  }
                  return roomJson.room as Room;
                })()
              );

        if (cancelled) return;

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

        // Round is revealed → show reveal until user continues
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
            pendingRotation: null,
          });
          return;
        }

        // Round exists, not revealed
        const submitterId = round.submittedBy;
        const amISubmitter = submitterId === sessionId;
        const hasVoted = round.votes.some((v: Vote) => v.sessionId === sessionId);

        if (amISubmitter) {
          const fullRound = round as Round;
          setState({
            phase: "awaiting_votes",
            room,
            round: fullRound,
            sessionId,
            votes: round.votes,
            playerCount: room.players.length,
            votedIndex: null,
            lieIndex: fullRound.lieIndex,
            voteResults: round.votes.map((v: Vote) =>
              buildVoteResult(
                room,
                v.sessionId,
                v.votedIndex,
                v.votedIndex === fullRound.lieIndex
              )
            ),
            isSubmitter: true,
            allVotesIn: false,
            pendingReveal: null,
            pendingRotation: null,
          });
        } else if (hasVoted) {
          const myVote = round.votes.find((v: Vote) => v.sessionId === sessionId);
          setState({
            phase: "awaiting_votes",
            room,
            round: round as RoundPublicView,
            sessionId,
            votes: round.votes,
            playerCount: room.players.length,
            votedIndex: myVote?.votedIndex ?? null,
            lieIndex: null,
            voteResults: [],
            isSubmitter: false,
            allVotesIn: false,
            pendingReveal: null,
            pendingRotation: null,
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
  }, [roomCode, router, getSubmitterName, buildVoteResult]);

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
        // Only non-submitters advance to voting here. The submitter must never
        // be pushed into voting on their own round — handleSubmit moves them to
        // "awaiting_votes" (it has the lieIndex locally; this event carries only
        // the public view without it). Ignoring the "submit" phase also avoids a
        // race where this broadcast lands before handleSubmit's own setState.
        if (prev.phase === "awaiting_statements") {
          return {
            phase: "vote",
            room: prev.room,
            round: data.round,
            sessionId: prev.sessionId,
            votedIndex: null,
          } as PlayState;
        }
        return prev;
      });
    };

    /* ---- VOTE_CAST ----
       Presence only — never includes lieIndex / isCorrect.
       Submitters already know the lie and can score votes locally;
       everyone else waits for ROUND_REVEALED. */
    const handleVoteCast = (data: {
      sessionId: string;
      votedIndex: 0 | 1 | 2;
      votes: Vote[];
      votesRemaining: number;
    }) => {
      setState((prev) => {
        if (prev.phase === "vote") {
          if (data.sessionId === prev.sessionId) {
            return {
              phase: "awaiting_votes",
              room: prev.room,
              round: prev.round,
              sessionId: prev.sessionId,
              votes: data.votes,
              playerCount: prev.room.players.length,
              votedIndex: data.votedIndex,
              lieIndex: null,
              voteResults: [],
              isSubmitter: false,
              allVotesIn: data.votesRemaining === 0,
              pendingReveal: null,
              pendingRotation: null,
            } as PlayState;
          }
          // Another player voted — update vote count while we still pick
          return {
            ...prev,
            round: { ...prev.round, votes: data.votes },
          } as PlayState;
        }
        if (prev.phase === "awaiting_votes") {
          // Submitter knows the lie — show live correctness as votes arrive.
          // Non-submitters only track vote counts until ROUND_REVEALED.
          if (prev.isSubmitter && prev.lieIndex !== null) {
            return {
              ...prev,
              votes: data.votes,
              voteResults: data.votes.map((v) =>
                buildVoteResult(
                  prev.room,
                  v.sessionId,
                  v.votedIndex,
                  v.votedIndex === prev.lieIndex
                )
              ),
              allVotesIn: prev.allVotesIn || data.votesRemaining === 0,
            } as PlayState;
          }
          return {
            ...prev,
            votes: data.votes,
            allVotesIn: prev.allVotesIn || data.votesRemaining === 0,
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
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      setState((prev) => {
        if (prev.phase === "awaiting_votes") {
          const room = {
            ...prev.room,
            players: prev.room.players.map((p) => {
              const updated = data.scores.find((s) => s.sessionId === p.sessionId);
              return updated ? { ...p, score: updated.score } : p;
            }),
          };
          return {
            ...prev,
            room,
            votes: data.round.votes,
            lieIndex: data.round.lieIndex,
            voteResults: data.round.votes.map((v) =>
              buildVoteResult(
                room,
                v.sessionId,
                v.votedIndex,
                v.votedIndex === data.round.lieIndex
              )
            ),
            allVotesIn: true,
            pendingReveal: {
              round: data.round,
              scoreDeltas: data.scoreDeltas,
              scores: data.scores,
            },
          } as PlayState;
        }

        if (prev.phase === "vote") {
          const myVote = data.round.votes.find(
            (v) => v.sessionId === prev.sessionId
          );
          if (myVote) {
            const room = {
              ...prev.room,
              players: prev.room.players.map((p) => {
                const updated = data.scores.find((s) => s.sessionId === p.sessionId);
                return updated ? { ...p, score: updated.score } : p;
              }),
            };
            return {
              phase: "awaiting_votes",
              room,
              round: prev.round,
              sessionId: prev.sessionId,
              votes: data.round.votes,
              playerCount: prev.room.players.length,
              votedIndex: myVote.votedIndex,
              lieIndex: data.round.lieIndex,
              voteResults: data.round.votes.map((v) =>
                buildVoteResult(
                  room,
                  v.sessionId,
                  v.votedIndex,
                  v.votedIndex === data.round.lieIndex
                )
              ),
              isSubmitter: false,
              allVotesIn: true,
              pendingReveal: {
                round: data.round,
                scoreDeltas: data.scoreDeltas,
                scores: data.scores,
              },
              pendingRotation: null,
            } as PlayState;
          }
        }

        if (
          prev.phase === "vote" ||
          prev.phase === "awaiting_statements"
        ) {
          const room =
            "room" in prev
              ? {
                  ...prev.room,
                  players: prev.room.players.map((p) => {
                    const updated = data.scores.find(
                      (s) => s.sessionId === p.sessionId
                    );
                    return updated ? { ...p, score: updated.score } : p;
                  }),
                }
              : ({} as Room);
          return {
            phase: "reveal",
            room,
            round: data.round,
            sessionId:
              "sessionId" in prev ? prev.sessionId : "",
            scoreDeltas: data.scoreDeltas,
            scores: data.scores,
            pendingRotation: null,
          } as PlayState;
        }
        return prev;
      });
    };

    /* ---- ROUND_ROTATED ---- */
    const handleRoundRotated = (data: {
      nextRound: number;
      nextSubmitter: { sessionId: string; displayName: string };
    }) => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      setState((prev) => {
        if (prev.phase === "awaiting_votes") {
          return { ...prev, pendingRotation: data } as PlayState;
        }
        if (prev.phase === "reveal") {
          return { ...prev, pendingRotation: data } as PlayState;
        }
        if (prev.phase === "scoreboard") {
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
      reason?: string;
      message?: string;
    }) => {
      // Clear reveal timer
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      if (data.message) {
        setNotification(data.message);
        setTimeout(() => setNotification(null), 6000);
      }

      setState((prev) => {
        if (!("room" in prev)) return prev;

        const updatedPlayers = prev.room.players.map((p) => {
          const final = data.scores.find((s) => s.sessionId === p.sessionId);
          return final ? { ...p, score: final.score } : p;
        });

        return {
          phase: "scoreboard",
          room: { ...prev.room, players: updatedPlayers, status: "finished" },
          sessionId: prev.sessionId,
          isGameOver: true,
          gameEndReason: data.reason,
          pendingRotation: null,
        } as PlayState;
      });
    };

    /* ---- PLAYER_LEFT / PLAYER_JOINED (connection status updates) ---- */
    const handlePlayerLeft = (data: {
      sessionId: string;
      displayName?: string;
      players: Player[];
      playerCount: number;
      abandonDeadline?: string | null;
    }) => {
      if (data.displayName) {
        setNotification(
          data.abandonDeadline
            ? `${data.displayName} disconnected — waiting for reconnect…`
            : `${data.displayName} left the game`
        );
        setTimeout(() => setNotification(null), 4000);
      }
      setState((prev) => {
        if (prev.phase === "awaiting_votes") {
          return {
            ...prev,
            room: { ...prev.room, players: data.players },
            // Count connected seats for the vote progress UI.
            playerCount: data.players.filter((p) => p.connected).length,
          } as PlayState;
        }
        if ("room" in prev) {
          return {
            ...prev,
            room: { ...prev.room, players: data.players },
          } as PlayState;
        }
        return prev;
      });

      // Remaining player: after reconnect grace, reconcile (and apply finished UI).
      if (abandonTimerRef.current) {
        clearTimeout(abandonTimerRef.current);
        abandonTimerRef.current = null;
      }
      if (data.abandonDeadline) {
        const delay =
          Math.max(0, Date.parse(data.abandonDeadline) - Date.now()) + 400;
        abandonTimerRef.current = setTimeout(() => {
          void pollRoomForAbandon();
        }, delay);
      } else if (data.players.filter((p) => p.connected).length < 2) {
        // Explicit leave may have already ended the game — pick that up now.
        void pollRoomForAbandon();
      }
    };

    const handlePlayerJoined = (data: {
      players: Player[];
      playerCount: number;
      targetSize: number;
    }) => {
      if (abandonTimerRef.current) {
        clearTimeout(abandonTimerRef.current);
        abandonTimerRef.current = null;
      }
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

    /* ---- PLAY_AGAIN_REQUESTED ---- */
    const handlePlayAgainRequested = (data: {
      initiatedBy: string;
    }) => {
      setNotification(`${data.initiatedBy} wants to play again!`);
    };

    channel.bind(PUSHER_EVENTS.STATEMENTS_SUBMITTED, handleStatementsSubmitted);
    channel.bind(PUSHER_EVENTS.VOTE_CAST, handleVoteCast);
    channel.bind(PUSHER_EVENTS.ROUND_REVEALED, handleRoundRevealed);
    channel.bind(PUSHER_EVENTS.ROUND_ROTATED, handleRoundRotated);
    channel.bind(PUSHER_EVENTS.GAME_ENDED, handleGameEnded);
    channel.bind(PUSHER_EVENTS.PLAYER_LEFT, handlePlayerLeft);
    channel.bind(PUSHER_EVENTS.PLAYER_JOINED, handlePlayerJoined);
    channel.bind(PUSHER_EVENTS.PLAY_AGAIN_REQUESTED, handlePlayAgainRequested);

    return () => {
      channel.unbind(PUSHER_EVENTS.STATEMENTS_SUBMITTED, handleStatementsSubmitted);
      channel.unbind(PUSHER_EVENTS.VOTE_CAST, handleVoteCast);
      channel.unbind(PUSHER_EVENTS.ROUND_REVEALED, handleRoundRevealed);
      channel.unbind(PUSHER_EVENTS.ROUND_ROTATED, handleRoundRotated);
      channel.unbind(PUSHER_EVENTS.GAME_ENDED, handleGameEnded);
      channel.unbind(PUSHER_EVENTS.PLAYER_LEFT, handlePlayerLeft);
      channel.unbind(PUSHER_EVENTS.PLAYER_JOINED, handlePlayerJoined);
      channel.unbind(PUSHER_EVENTS.PLAY_AGAIN_REQUESTED, handlePlayAgainRequested);
      pusher.unsubscribe(channelName);
    };
  }, [state.phase, roomCode, buildVoteResult, pollRoomForAbandon]);

  // While alone mid-game (submit or vote wait), keep polling so a leave/abandon
  // cannot leave this client stuck if a Pusher event was missed.
  useEffect(() => {
    if (
      state.phase === "loading" ||
      state.phase === "error" ||
      state.phase === "finished" ||
      state.phase === "scoreboard"
    ) {
      return;
    }
    if (!("room" in state) || state.room.status !== "playing") return;

    const connected = state.room.players.filter((p) => p.connected).length;
    if (connected >= 2) return;

    // Poll immediately, then on an interval. pollRoomForAbandon updates state
    // internally; this initial call is the intended kick-off, not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time poll kickoff for abandon detection
    void pollRoomForAbandon();
    const id = setInterval(() => {
      void pollRoomForAbandon();
    }, 2500);
    return () => clearInterval(id);
  }, [state, pollRoomForAbandon]);

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

      setState((prev) => {
        if (prev.phase !== "submit") return prev;
        return {
          phase: "awaiting_votes",
          room: prev.room,
          round: json.round,
          sessionId: prev.sessionId,
          votes: [],
          playerCount: prev.room.players.length,
          votedIndex: null,
          lieIndex,
          voteResults: [],
          isSubmitter: true,
          allVotesIn: false,
          pendingReveal: null,
          pendingRotation: null,
        };
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

      // Answer stays hidden until ROUND_REVEALED (all votes in or timer).
      setState((prev) => {
        if (prev.phase === "awaiting_votes") return prev;
        if (prev.phase !== "vote") return prev;
        return {
          phase: "awaiting_votes",
          room: prev.room,
          round: prev.round,
          sessionId: prev.sessionId,
          votes: json.vote ? [json.vote] : [],
          playerCount: prev.room.players.length,
          votedIndex,
          lieIndex: null,
          voteResults: [],
          isSubmitter: false,
          allVotesIn: json.votesRemaining === 0,
          pendingReveal: null,
          pendingRotation: null,
        };
      });
    },
    [state, roomCode]
  );

  const handleContinueFromResults = useCallback(() => {
    if (state.phase !== "awaiting_votes" || !state.pendingReveal) return;

    setState({
      phase: "reveal",
      room: state.room,
      round: state.pendingReveal.round,
      sessionId: state.sessionId,
      scoreDeltas: state.pendingReveal.scoreDeltas,
      scores: state.pendingReveal.scores,
      pendingRotation: state.pendingRotation,
    });
  }, [state]);

  /** Timer expired — close voting; missing votes count as wrong for the writer. */
  const handleVoteTimeout = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase !== "vote" && current.phase !== "awaiting_votes") return;

    const roundNumber = current.round.roundNumber;

    try {
      await fetch("/api/round/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, roundNumber }),
      });
    } catch {
      // Another client may have revealed already; Pusher will sync state.
    }
  }, [roomCode]);

  const handleRevealContinue = useCallback(() => {
    if (state.phase !== "reveal") return;

    const totalRounds = state.room.players.length;
    setState({
      phase: "scoreboard",
      room: state.room,
      sessionId: state.sessionId,
      isGameOver:
        state.room.status === "finished" ||
        state.round.roundNumber >= totalRounds,
      pendingRotation: state.pendingRotation,
    });
  }, [state]);

  const handleScoreboardContinue = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (state.phase !== "scoreboard") return;

    if (state.isGameOver) {
      setState({
        phase: "finished",
        room: state.room,
        sessionId: state.sessionId,
        gameEndReason: state.gameEndReason,
      });
      return;
    }

    if (state.pendingRotation) {
      const { nextRound, nextSubmitter } = state.pendingRotation;
      const amISubmitter = nextSubmitter.sessionId === state.sessionId;
      const updatedRoom = { ...state.room, currentRound: nextRound };

      if (amISubmitter) {
        setState({
          phase: "submit",
          room: updatedRoom,
          sessionId: state.sessionId,
        });
      } else {
        setState({
          phase: "awaiting_statements",
          room: updatedRoom,
          sessionId: state.sessionId,
          submitterName: nextSubmitter.displayName,
        });
      }
    }
  }, [state]);

  const handlePlayAgain = useCallback(async () => {
    const sid = sessionIdRef.current || getOrCreateSessionId();
    try {
      await fetch(`/api/room/${encodeURIComponent(roomCode)}/play-again`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
    } catch {
      // Best-effort — navigate to lobby regardless
    }
    router.push(`/room/${roomCode}`);
  }, [roomCode, router]);

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
      <main className="flex min-h-dvh items-center justify-center px-4">
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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-warm">
          Something went wrong
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

  /* ---- Shared layout wrapper ---- */
  const renderHeader = (room: Room) => (
    <header className="text-center space-y-1">
      <div className="flex items-center justify-center gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">
          Case file{" "}
          <span className="font-mono text-warm">{room.roomCode}</span>
        </p>
        <CopyLinkButton roomCode={room.roomCode} />
      </div>
      <p className="text-xs text-muted/85">
        Round {room.currentRound} of {room.players.length}
      </p>
    </header>
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start px-4 py-12">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={handleLeave}
          className="leave-action"
          title="Leave game"
        >
          Leave game
        </button>
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-lg space-y-6">
        {/* ---- Notification banner ---- */}
        {notification && (
          <div className="animate-fade-in-up rounded-lg border border-truth/30 bg-truth/5 px-4 py-3 text-center text-sm text-warm">
            {notification}
          </div>
        )}

        {/* ---- Player status bar ---- */}
        {("room" in state) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {state.room.players.map((p: Player, index: number) => {
              const isSelf = p.sessionId === state.sessionId;
              return (
                <div
                  key={p.sessionId}
                  className={
                    "flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm transition-all " +
                    (isSelf
                      ? "border-truth/40 bg-truth/5 shadow-sm"
                      : "border-border bg-card") +
                    (!p.connected ? " opacity-50" : "")
                  }
                >
                  <PlayerAvatar
                    displayName={p.displayName}
                    avatarColor={p.avatarColor}
                    index={index}
                    size="sm"
                  />
                  <span
                    className={
                      "inline-block h-2 w-2 shrink-0 rounded-full " +
                      (p.connected ? "bg-truth shadow-[0_0_6px_var(--color-truth)]" : "bg-lie")
                    }
                    title={p.connected ? "Online" : "Disconnected"}
                  />
                  <span
                    className={
                      "truncate max-w-[100px] font-medium " +
                      (isSelf ? "text-truth" : "text-warm")
                    }
                  >
                    {p.displayName}
                    {isSelf && (
                      <span className="ml-1 text-xs text-muted font-normal">
                        you
                      </span>
                    )}
                  </span>
                  <span
                    className={
                      "ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums " +
                      (p.score > 0
                        ? "bg-truth/15 text-truth"
                        : "bg-card text-muted")
                    }
                  >
                    {p.score}
                    <span className="ml-0.5 text-[0.6rem] font-normal opacity-70">
                      {p.score === 1 ? "pt" : "pts"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Phase-specific content ---- */}
        {state.phase === "submit" && (
          <div className="animate-fade-in-up space-y-6" key="submit">
            {renderHeader(state.room)}
            <StatementForm onSubmit={handleSubmit} loading={false} />
          </div>
        )}

        {state.phase === "awaiting_statements" && (() => {
          const submitterIdx =
            (state.room.currentRound - 1) % state.room.players.length;
          const submitter = state.room.players[submitterIdx];
          return (
            <div className="animate-fade-in-up space-y-6" key="awaiting_statements">
              {renderHeader(state.room)}
              <AwaitingStatements
                submitterName={state.submitterName}
                submitterAvatarColor={submitter?.avatarColor}
                submitterIndex={submitterIdx}
                currentRound={state.room.currentRound}
                totalRounds={state.room.players.length}
              />
            </div>
          );
        })()}

        {state.phase === "vote" && (() => {
          const submitterIdx =
            (state.round.roundNumber - 1) % state.room.players.length;
          const submitter = state.room.players[submitterIdx];
          return (
            <div className="animate-fade-in-up space-y-6" key="vote">
              {renderHeader(state.room)}
              <VotePanel
                statements={state.round.statements}
                submittedBy={getSubmitterName(state.room, state.round.roundNumber)}
                submittedByAvatarColor={submitter?.avatarColor}
                submittedByIndex={submitterIdx}
                votes={state.round.votes}
                playerCount={state.room.players.length}
                onVote={handleVote}
                hasVoted={false}
                votedIndex={state.votedIndex}
                voteDeadline={state.round.voteDeadline}
                onTimeout={handleVoteTimeout}
              />
            </div>
          );
        })()}

        {state.phase === "awaiting_votes" && (() => {
          const submitterIdx =
            (state.round.roundNumber - 1) % state.room.players.length;
          const submitter = state.room.players[submitterIdx];
          return (
            <div className="animate-fade-in-up space-y-6" key="awaiting_votes">
              {renderHeader(state.room)}
              <VotePanel
                statements={state.round.statements}
                submittedBy={getSubmitterName(state.room, state.round.roundNumber)}
                submittedByAvatarColor={submitter?.avatarColor}
                submittedByIndex={submitterIdx}
                votes={state.votes}
                playerCount={state.playerCount}
                onVote={async () => {}}
                hasVoted={!state.isSubmitter && state.votedIndex !== null}
                votedIndex={state.votedIndex}
                lieIndex={state.lieIndex}
                voteResults={state.voteResults}
                isSubmitter={state.isSubmitter}
                showContinue={state.allVotesIn && state.pendingReveal !== null}
                onContinue={handleContinueFromResults}
                voteDeadline={state.round.voteDeadline}
                onTimeout={handleVoteTimeout}
              />
            </div>
          );
        })()}

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
                avatarColor: p.avatarColor,
              }))}
            />
            <div className="text-center">
              <button
                onClick={handleRevealContinue}
                className="rounded-lg bg-truth px-8 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {state.phase === "scoreboard" && (
          <div className="animate-fade-in-up space-y-6" key="scoreboard">
            <Scoreboard
              players={state.room.players}
              currentRound={state.room.currentRound}
              totalRounds={state.room.players.length}
              isGameOver={state.isGameOver}
              currentPlayerSessionId={state.sessionId}
              onContinue={handleScoreboardContinue}
              onPlayAgain={handlePlayAgain}
              gameEndReason={state.gameEndReason}
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
              gameEndReason={state.gameEndReason}
            />
          </div>
        )}
      </div>
    </main>
  );
}
