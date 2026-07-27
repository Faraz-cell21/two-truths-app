import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { computeSubmitDeadline } from "@/lib/gameTiming";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import type { LeanRoomDocument } from "@/lib/serializeRoom";

/**
 * Starts the writing clock the first time any client reaches the writing UI.
 * Idempotent — if a deadline is already set for this turn, returns it.
 * Does NOT invent a deadline during lobby / scoreboard / reveal.
 */
export async function beginSubmitWindow(
  roomCode: string
): Promise<{ submitDeadline: string } | null> {
  const room = await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>();
  if (!room || room.status !== "playing" || !room.currentRound) {
    return null;
  }

  if (room.submitDeadline) {
    const existing = new Date(room.submitDeadline);
    if (!Number.isNaN(existing.getTime())) {
      return { submitDeadline: existing.toISOString() };
    }
  }

  const roundExists = await RoundModel.exists({
    roomCode,
    roundNumber: room.currentRound,
  });
  if (roundExists) {
    return null;
  }

  const submitDeadline = computeSubmitDeadline();
  const updated = await RoomModel.findOneAndUpdate(
    {
      roomCode,
      status: "playing",
      currentRound: room.currentRound,
      $or: [{ submitDeadline: null }, { submitDeadline: { $exists: false } }],
    },
    { $set: { submitDeadline } },
    { new: true }
  ).lean<LeanRoomDocument | null>();

  const deadline = updated?.submitDeadline
    ? new Date(updated.submitDeadline)
    : submitDeadline;

  // If we lost the race, another client set it — read the winner's value.
  if (!updated) {
    const again = await RoomModel.findOne({ roomCode }).lean<LeanRoomDocument | null>();
    if (again?.submitDeadline) {
      const d = new Date(again.submitDeadline);
      if (!Number.isNaN(d.getTime())) {
        return { submitDeadline: d.toISOString() };
      }
    }
    return null;
  }

  const iso = deadline.toISOString();
  await pusherServer.trigger(
    getRoomChannelName(roomCode),
    PUSHER_EVENTS.SUBMIT_WINDOW_STARTED,
    { submitDeadline: iso, roundNumber: room.currentRound }
  );

  return { submitDeadline: iso };
}
