import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import { serializeRound } from "@/lib/serializeRound";
import type { ScoreDelta } from "@/types/game";
import type { RevealSuccessResponse } from "@/types/api";
import { finishedExpiresAt } from "@/lib/roomLifetime";

/**
 * Shared reveal logic — called both by the /api/round/vote route (when
 * the last vote triggers an auto-reveal) and by the /api/round/reveal
 * route (manual / timer-based reveal).
 *
 * Scoring runs exactly once per round. When the vote timer expires every
 * connected client posts a reveal simultaneously, so the caller that gets to
 * apply the score increments is decided by an atomic claim on revealedAt
 * rather than by a read-then-write check. Losers report current state.
 */
export async function performReveal(
  roomCode: string,
  roundNumber: number
): Promise<RevealSuccessResponse | { error: string; status: number }> {
  // 1. Fetch round — distinguishes "no such round" from "lost the claim".
  const existing = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!existing) {
    return { error: "Round not found.", status: 404 };
  }

  // 2. Claim the reveal. Only one caller can flip revealedAt from null, and
  //    the score write below uses $inc, which would multiply if it ever ran
  //    twice for the same round.
  const round = await RoundModel.findOneAndUpdate(
    { roomCode, roundNumber, revealedAt: null },
    { $set: { revealedAt: new Date() } },
    { new: true }
  ).lean();

  if (!round) {
    // Already revealed, or another caller won the race — never re-score.
    return buildRevealedResult(roomCode, roundNumber);
  }

  // 3. Fetch room
  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) return { error: "Room not found.", status: 404 };

  const totalRounds = room.players.length;
  const gameEnded = roundNumber >= totalRounds;

  // 4. Calculate score deltas
  const scoreDeltas = computeScoreDeltas(round, room.players);

  // 5. Atomically update scores in Room
  const bulkOps: Array<{
    updateOne: {
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
    };
  }> = [];

  for (const delta of scoreDeltas) {
    if (delta.delta > 0) {
      bulkOps.push({
        updateOne: {
          filter: { roomCode, "players.sessionId": delta.sessionId },
          update: { $inc: { "players.$.score": delta.delta } },
        },
      });
    }
  }

  // Advance round or finish game. Writing deadline starts when clients
  // open the next writing UI — not during reveal / scoreboard.
  if (gameEnded) {
    bulkOps.push({
      updateOne: {
        filter: { roomCode },
        update: {
          $set: {
            status: "finished",
            expiresAt: finishedExpiresAt(),
            submitDeadline: null,
          },
        },
      },
    });
  } else {
    bulkOps.push({
      updateOne: {
        filter: { roomCode },
        update: {
          $set: {
            currentRound: roundNumber + 1,
            submitDeadline: null,
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    await RoomModel.bulkWrite(bulkOps);
  }

  // 6. Re-fetch room for current scores (revealedAt was already set by the
  //    claim in step 2).
  const updatedRoom = await RoomModel.findOne({ roomCode }).lean();
  const scores: Array<{ sessionId: string; displayName: string; score: number }> = updatedRoom
    ? (updatedRoom.players as Array<{ sessionId: string; displayName: string; score: number }>).map((p) => ({
        sessionId: p.sessionId,
        displayName: p.displayName,
        score: p.score,
      }))
    : (room.players as Array<{ sessionId: string; displayName: string; score: number }>).map((p) => ({
        sessionId: p.sessionId,
        displayName: p.displayName,
        score: p.score + (scoreDeltas.find((d) => d.sessionId === p.sessionId)?.delta ?? 0),
      }));

  // 7. Fire Pusher events
  const channel = getRoomChannelName(roomCode);
  const fullRound = serializeRound(round);

  const nextSubmitter = gameEnded
    ? null
    : {
        sessionId: room.players[roundNumber % room.players.length].sessionId,
        displayName: room.players[roundNumber % room.players.length].displayName,
      };

  await pusherServer.trigger(channel, PUSHER_EVENTS.ROUND_REVEALED, {
    round: fullRound,
    scoreDeltas,
    scores,
  });

  if (gameEnded) {
    const winner = findWinner(scores);
    await pusherServer.trigger(channel, PUSHER_EVENTS.GAME_ENDED, {
      scores,
      winner,
    });
  } else {
    await pusherServer.trigger(channel, PUSHER_EVENTS.ROUND_ROTATED, {
      nextRound: roundNumber + 1,
      nextSubmitter,
      submitDeadline: null,
    });
  }

  return {
    round: fullRound,
    scoreDeltas,
    scores,
    nextRound: gameEnded ? null : roundNumber + 1,
    nextSubmitter,
    gameEnded,
  };
}

/* ------------------------------------------------------------------ */

/**
 * Read-only view of an already-revealed round, for callers that lost the
 * reveal claim. Scores may trail the winner's write by a few milliseconds;
 * clients treat the ROUND_REVEALED broadcast as authoritative.
 */
async function buildRevealedResult(
  roomCode: string,
  roundNumber: number
): Promise<RevealSuccessResponse | { error: string; status: number }> {
  const round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!round) return { error: "Round not found.", status: 404 };

  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) return { error: "Room not found.", status: 404 };

  const players = room.players as Array<{
    sessionId: string;
    displayName: string;
    score: number;
    connected?: boolean;
  }>;

  const gameEnded = roundNumber >= players.length;

  return {
    round: serializeRound(round),
    scoreDeltas: computeScoreDeltas(round, players),
    scores: players.map((p) => ({
      sessionId: p.sessionId,
      displayName: p.displayName,
      score: p.score,
    })),
    nextRound: gameEnded ? null : roundNumber + 1,
    nextSubmitter: gameEnded
      ? null
      : {
          sessionId: players[roundNumber % players.length].sessionId,
          displayName: players[roundNumber % players.length].displayName,
        },
    gameEnded,
  };
}

export function computeScoreDeltas(
  round: {
    lieIndex: number;
    submittedBy: string;
    votes: Array<{ sessionId: string; votedIndex: number }>;
  },
  players: Array<{ sessionId: string; displayName: string; connected?: boolean }>
): ScoreDelta[] {
  const deltas: Record<string, number> = {};
  const reasons: Record<string, ScoreDelta["reason"]> = {};

  // Everyone starts at 0
  for (const p of players) {
    deltas[p.sessionId] = 0;
    reasons[p.sessionId] = "none";
  }

  const voterIds = new Set(round.votes.map((v) => v.sessionId));

  for (const vote of round.votes) {
    if (vote.votedIndex === round.lieIndex) {
      deltas[vote.sessionId] = (deltas[vote.sessionId] || 0) + 1;
      reasons[vote.sessionId] = "correct-guess";
    } else {
      deltas[round.submittedBy] = (deltas[round.submittedBy] || 0) + 1;
      reasons[round.submittedBy] = "fooled";
    }
  }

  // No vote counts as wrong — same as a missed guess.
  // Match vote-route eligibility: connected non-submitters only.
  for (const p of players) {
    if (p.sessionId === round.submittedBy) continue;
    if (p.connected === false) continue;
    if (voterIds.has(p.sessionId)) continue;

    deltas[round.submittedBy] = (deltas[round.submittedBy] || 0) + 1;
    reasons[round.submittedBy] = "fooled";
  }

  return players.map((p) => ({
    sessionId: p.sessionId,
    displayName: p.displayName,
    delta: deltas[p.sessionId] || 0,
    reason: reasons[p.sessionId] || "none",
  }));
}

function findWinner(
  scores: Array<{ sessionId: string; displayName: string; score: number }>
): { sessionId: string; displayName: string; score: number } | null {
  if (scores.length === 0) return null;
  const maxScore = Math.max(...scores.map((s) => s.score));
  const topPlayers = scores.filter((s) => s.score === maxScore);
  // Tie → no single winner
  if (topPlayers.length > 1) return null;
  return topPlayers[0];
}
