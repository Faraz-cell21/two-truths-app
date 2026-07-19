import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import { finishedExpiresAt } from "@/lib/roomLifetime";
import type { LeanRoomDocument } from "@/lib/serializeRoom";
import { revealIfVotingComplete } from "@/lib/revealIfVotingComplete";

export type AbandonResult =
  | { ended: false; room: LeanRoomDocument }
  | {
      ended: true;
      room: LeanRoomDocument;
      scores: Array<{ sessionId: string; displayName: string; score: number }>;
    };

async function finishPlayingRoom(
  roomCode: string,
  message: string
): Promise<AbandonResult | null> {
  const latest = await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>();
  if (!latest) return null;
  if (latest.status === "finished") {
    return {
      ended: true,
      room: latest,
      scores: latest.players.map((p) => ({
        sessionId: p.sessionId,
        displayName: p.displayName,
        score: p.score,
      })),
    };
  }
  if (latest.status !== "playing") {
    return { ended: false, room: latest };
  }

  await revealIfVotingComplete(latest);

  const updated = await RoomModel.findOneAndUpdate(
    { roomCode, status: "playing" },
    {
      $set: {
        status: "finished",
        expiresAt: finishedExpiresAt(),
        abandonDeadline: null,
      },
    },
    { new: true }
  ).lean<LeanRoomDocument | null>();

  if (!updated) {
    const again = await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>();
    if (!again) return null;
    if (again.status === "finished") {
      return {
        ended: true,
        room: again,
        scores: again.players.map((p) => ({
          sessionId: p.sessionId,
          displayName: p.displayName,
          score: p.score,
        })),
      };
    }
    return { ended: false, room: again };
  }

  const scores = updated.players.map((p) => ({
    sessionId: p.sessionId,
    displayName: p.displayName,
    score: p.score,
  }));

  await pusherServer.trigger(getRoomChannelName(roomCode), PUSHER_EVENTS.GAME_ENDED, {
    scores,
    reason: "not-enough-players",
    message,
  });

  return { ended: true, room: updated, scores };
}

/**
 * Explicit Leave (not a refresh beacon): end the match when fewer than
 * 2 players remain so the other client is not stuck on "is writing…".
 */
export async function endGameIfAlone(
  roomCode: string,
  room?: LeanRoomDocument | null
): Promise<AbandonResult | null> {
  const doc =
    room ??
    (await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>());
  if (!doc) return null;

  if (doc.status === "finished") {
    return {
      ended: true,
      room: doc,
      scores: doc.players.map((p) => ({
        sessionId: p.sessionId,
        displayName: p.displayName,
        score: p.score,
      })),
    };
  }

  if (doc.status !== "playing") {
    return { ended: false, room: doc };
  }

  const connected = doc.players.filter((p) => p.connected).length;
  if (connected >= 2) {
    return { ended: false, room: doc };
  }

  return finishPlayingRoom(
    roomCode,
    "Not enough players remaining — a player left the game."
  );
}

/**
 * If a playing room's reconnect grace has elapsed and fewer than 2 players
 * are connected, reveal any open round then mark the game finished.
 */
export async function reconcileAbandonedRoom(
  roomCode: string,
  room?: LeanRoomDocument | null
): Promise<AbandonResult | null> {
  const doc =
    room ??
    (await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>());
  if (!doc) return null;

  if (doc.status !== "playing") {
    return { ended: false, room: doc };
  }

  const connected = doc.players.filter((p) => p.connected).length;

  // Recover submit-phase rooms stuck alone with no grace marker.
  if (connected < 2 && !doc.abandonDeadline) {
    const roundExists = await RoundModel.exists({
      roomCode,
      roundNumber: doc.currentRound,
    });
    if (!roundExists) {
      return finishPlayingRoom(
        roomCode,
        "Not enough players remaining — a player left while writing."
      );
    }
    return { ended: false, room: doc };
  }

  if (!doc.abandonDeadline) {
    return { ended: false, room: doc };
  }

  const deadline =
    doc.abandonDeadline instanceof Date
      ? doc.abandonDeadline
      : new Date(doc.abandonDeadline);
  if (Number.isNaN(deadline.getTime()) || Date.now() < deadline.getTime()) {
    return { ended: false, room: doc };
  }

  if (connected >= 2) {
    await RoomModel.updateOne(
      { roomCode, status: "playing" },
      { $set: { abandonDeadline: null } }
    );
    const cleared = await RoomModel.findOne({
      roomCode,
    }).lean<LeanRoomDocument | null>();
    return { ended: false, room: cleared ?? doc };
  }

  return finishPlayingRoom(
    roomCode,
    "Not enough players remaining — the game ended after the reconnect window."
  );
}
