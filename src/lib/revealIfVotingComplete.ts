import { RoundModel } from "@/models/Round";
import { performReveal } from "@/lib/revealRound";
import type { LeanRoomDocument } from "@/lib/serializeRoom";
import type { RevealSuccessResponse } from "@/types/api";

/**
 * If the current round is open and every remaining connected non-submitter
 * has already voted (or none remain), reveal immediately.
 */
export async function revealIfVotingComplete(
  room: LeanRoomDocument
): Promise<RevealSuccessResponse | null> {
  if (room.status !== "playing" || !room.currentRound) return null;

  const round = await RoundModel.findOne({
    roomCode: room.roomCode,
    roundNumber: room.currentRound,
    revealedAt: null,
  }).lean();

  if (!round) return null;

  const eligible = room.players.filter(
    (p) => p.sessionId !== round.submittedBy && p.connected
  );

  const allConnectedVoted =
    eligible.length === 0 ||
    eligible.every((p) =>
      round.votes.some(
        (v: { sessionId: string }) => v.sessionId === p.sessionId
      )
    );

  if (!allConnectedVoted) return null;

  const result = await performReveal(room.roomCode, room.currentRound);
  if ("error" in result) return null;
  return result;
}
