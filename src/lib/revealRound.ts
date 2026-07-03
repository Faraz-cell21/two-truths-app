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

/**
 * Shared reveal logic — called both by the /api/round/vote route (when
 * the last vote triggers an auto-reveal) and by the /api/round/reveal
 * route (manual / timer-based reveal).
 *
 * Idempotent: if the round is already revealed, returns the existing
 * result immediately instead of re-scoring.
 */
export async function performReveal(
  roomCode: string,
  roundNumber: number
): Promise<RevealSuccessResponse | { error: string; status: number }> {
  // 1. Fetch round
  const round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!round) {
    return { error: "Round not found.", status: 404 };
  }

  // 2. Idempotency — already revealed
  if (round.revealedAt) {
    const room = await RoomModel.findOne({ roomCode }).lean();
    if (!room) return { error: "Room not found.", status: 404 };

    const scoreDeltas = computeScoreDeltas(round, room.players as Array<{ sessionId: string; displayName: string }>);
    const totalRounds = room.players.length;
    const gameEnded = roundNumber >= totalRounds;

    return {
      round: serializeRound(round),
      scoreDeltas,
      scores: (room.players as Array<{ sessionId: string; displayName: string; score: number }>).map((p) => ({
        sessionId: p.sessionId,
        displayName: p.displayName,
        score: p.score,
      })),
      nextRound: gameEnded ? null : roundNumber + 1,
      nextSubmitter: gameEnded
        ? null
        : {
            sessionId: room.players[roundNumber % room.players.length].sessionId,
            displayName: room.players[roundNumber % room.players.length].displayName,
          },
      gameEnded,
    };
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

  // Advance round or finish game
  if (gameEnded) {
    bulkOps.push({
      updateOne: {
        filter: { roomCode },
        update: { $set: { status: "finished" } },
      },
    });
  } else {
    bulkOps.push({
      updateOne: {
        filter: { roomCode },
        update: { $set: { currentRound: roundNumber + 1 } },
      },
    });
  }

  if (bulkOps.length > 0) {
    await RoomModel.bulkWrite(bulkOps);
  }

  // 6. Mark round as revealed
  await RoundModel.updateOne(
    { roomCode, roundNumber },
    { $set: { revealedAt: new Date() } }
  );

  // 7. Re-fetch room for current scores
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

  // 8. Fire Pusher events
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

export function computeScoreDeltas(
  round: {
    lieIndex: number;
    submittedBy: string;
    votes: Array<{ sessionId: string; votedIndex: number }>;
  },
  players: Array<{ sessionId: string; displayName: string }>
): ScoreDelta[] {
  const deltas: Record<string, number> = {};
  const reasons: Record<string, ScoreDelta["reason"]> = {};

  // Everyone starts at 0
  for (const p of players) {
    deltas[p.sessionId] = 0;
    reasons[p.sessionId] = "none";
  }

  for (const vote of round.votes) {
    if (vote.votedIndex === round.lieIndex) {
      deltas[vote.sessionId] = (deltas[vote.sessionId] || 0) + 1;
      reasons[vote.sessionId] = "correct-guess";
    } else {
      deltas[round.submittedBy] = (deltas[round.submittedBy] || 0) + 1;
      reasons[round.submittedBy] = "fooled";
    }
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
