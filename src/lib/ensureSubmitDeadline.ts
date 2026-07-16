import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { computeSubmitDeadline } from "@/lib/gameTiming";

/**
 * If the room is mid submit-window (playing, round has no statements yet)
 * but submitDeadline is missing (legacy rooms / schema cache), set one now.
 */
export async function ensureSubmitDeadline(roomCode: string): Promise<Date | null> {
  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room || room.status !== "playing" || !room.currentRound) {
    return null;
  }

  if (room.submitDeadline) {
    const existing = new Date(room.submitDeadline as Date);
    if (!Number.isNaN(existing.getTime())) {
      return existing;
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
  await RoomModel.updateOne(
    {
      roomCode,
      status: "playing",
      currentRound: room.currentRound,
      $or: [
        { submitDeadline: null },
        { submitDeadline: { $exists: false } },
      ],
    },
    { $set: { submitDeadline } }
  );

  return submitDeadline;
}
