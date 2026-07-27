import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import { isSubmitDeadlinePassed } from "@/lib/gameTiming";
import { finishedExpiresAt } from "@/lib/roomLifetime";
import type { LeanRoomDocument } from "@/lib/serializeRoom";

export type SubmitTimeoutSuccess = {
  timedOut: true;
  timedOutSessionId: string;
  timedOutDisplayName: string;
  scores: Array<{ sessionId: string; displayName: string; score: number }>;
  nextRound: number | null;
  nextSubmitter: { sessionId: string; displayName: string } | null;
  gameEnded: boolean;
  submitDeadline: string | null;
  message: string;
};

/**
 * If the writing window has expired and no Round was created, penalize the
 * writer (−1, floored at 0), skip the turn, and rotate or end the game.
 * Idempotent across concurrent clients via an atomic claim on submitDeadline.
 *
 * The next turn's writing clock is NOT started here — it starts when clients
 * open the writing UI via beginSubmitWindow.
 */
export async function reconcileSubmitDeadline(
  roomCode: string,
  room?: LeanRoomDocument | null
): Promise<SubmitTimeoutSuccess | null> {
  const doc =
    room ??
    (await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>());

  if (!doc || doc.status !== "playing") return null;
  if (!doc.currentRound) return null;
  if (!isSubmitDeadlinePassed(doc.submitDeadline ?? null)) return null;

  const roundExists = await RoundModel.exists({
    roomCode,
    roundNumber: doc.currentRound,
  });
  if (roundExists) {
    await RoomModel.updateOne(
      { roomCode, status: "playing" },
      { $set: { submitDeadline: null } }
    );
    return null;
  }

  const submitterIdx = (doc.currentRound - 1) % doc.players.length;
  const submitter = doc.players[submitterIdx];
  if (!submitter) return null;

  const newScore = Math.max(0, submitter.score - 1);
  const totalRounds = doc.players.length;
  const gameEnded = doc.currentRound >= totalRounds;
  const nextRound = gameEnded ? null : doc.currentRound + 1;
  const nextSubmitter =
    gameEnded || nextRound === null
      ? null
      : (() => {
          const idx = (nextRound - 1) % doc.players.length;
          const p = doc.players[idx];
          return {
            sessionId: p?.sessionId ?? "",
            displayName: p?.displayName ?? "Unknown",
          };
        })();

  const updated = await RoomModel.findOneAndUpdate(
    {
      roomCode,
      status: "playing",
      currentRound: doc.currentRound,
      submitDeadline: { $lte: new Date() },
    },
    {
      $set: {
        [`players.${submitterIdx}.score`]: newScore,
        submitDeadline: null,
        ...(gameEnded
          ? {
              status: "finished" as const,
              expiresAt: finishedExpiresAt(),
              abandonDeadline: null,
            }
          : {
              currentRound: nextRound,
            }),
      },
    },
    { new: true }
  ).lean<LeanRoomDocument | null>();

  if (!updated) return null;

  const scores = updated.players.map((p) => ({
    sessionId: p.sessionId,
    displayName: p.displayName,
    score: p.score,
  }));

  const message = `${submitter.displayName} ran out of time (−1).`;
  const payload: SubmitTimeoutSuccess = {
    timedOut: true,
    timedOutSessionId: submitter.sessionId,
    timedOutDisplayName: submitter.displayName,
    scores,
    nextRound,
    nextSubmitter,
    gameEnded,
    submitDeadline: null,
    message,
  };

  const channel = getRoomChannelName(roomCode);
  await pusherServer.trigger(channel, PUSHER_EVENTS.SUBMIT_TIMED_OUT, payload);

  if (gameEnded) {
    await pusherServer.trigger(channel, PUSHER_EVENTS.GAME_ENDED, {
      scores,
      reason: "submit-timeout",
      message,
    });
  }

  return payload;
}
