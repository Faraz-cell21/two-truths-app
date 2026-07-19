import { RoundModel } from "@/models/Round";
import { performReveal } from "@/lib/revealRound";
import { isVoteDeadlinePassed } from "@/lib/gameTiming";
import type { RevealSuccessResponse } from "@/types/api";
import type { LeanRoundDocument } from "@/lib/serializeRound";

/**
 * If the voting window has ended and the round is still open, run reveal.
 * Returns the reveal payload when reconciliation happened (or the round was
 * already revealed via a race); null when voting is still open.
 */
export async function revealIfVoteDeadlinePassed(
  roomCode: string,
  roundNumber: number,
  round?: LeanRoundDocument | null
): Promise<RevealSuccessResponse | null> {
  const doc =
    round ??
    (await RoundModel.findOne({ roomCode, roundNumber }).lean<LeanRoundDocument | null>());

  if (!doc) return null;
  if (doc.revealedAt) return null;
  if (!isVoteDeadlinePassed(doc)) return null;

  const result = await performReveal(roomCode, roundNumber);
  if ("error" in result) return null;
  return result;
}
