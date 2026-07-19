import type { Round, RoundPublicView } from "@/types/game";
import { VOTE_DURATION_MS } from "@/lib/gameTiming";

/**
 * Raw shape that comes back from a Mongoose `.lean()` call on a Round
 * document. Same pattern as LeanRoomDocument in serializeRoom.ts.
 */
export interface LeanRoundDocument {
  roomCode: string;
  roundNumber: number;
  submittedBy: string;
  statements: string[];
  lieIndex: number;
  votes: Array<{ sessionId: string; votedIndex: number }>;
  voteDeadline?: Date | null;
  revealedAt: Date | null;
  createdAt: Date;
}

function serializeVoteDeadline(doc: LeanRoundDocument): string {
  if (doc.voteDeadline) {
    return new Date(doc.voteDeadline).toISOString();
  }
  // Legacy rounds created before voteDeadline existed.
  return new Date(doc.createdAt.getTime() + VOTE_DURATION_MS).toISOString();
}

/**
 * Full Round (includes lieIndex — only safe for the submitter or after
 * the round has been revealed).
 */
export function serializeRound(doc: LeanRoundDocument): Round {
  return {
    roomCode: doc.roomCode,
    roundNumber: doc.roundNumber,
    submittedBy: doc.submittedBy,
    statements: doc.statements as [string, string, string],
    lieIndex: doc.lieIndex as 0 | 1 | 2,
    votes: doc.votes.map((v) => ({
      sessionId: v.sessionId,
      votedIndex: v.votedIndex as 0 | 1 | 2,
    })),
    voteDeadline: serializeVoteDeadline(doc),
    revealedAt: doc.revealedAt ? doc.revealedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Public view — strips lieIndex so non-submitter clients never receive
 * the answer before the reveal, even if they inspect network traffic.
 */
export function serializeRoundPublicView(
  doc: LeanRoundDocument
): RoundPublicView {
  return {
    roomCode: doc.roomCode,
    roundNumber: doc.roundNumber,
    submittedBy: doc.submittedBy,
    statements: doc.statements as [string, string, string],
    votes: doc.votes.map((v) => ({
      sessionId: v.sessionId,
      votedIndex: v.votedIndex as 0 | 1 | 2,
    })),
    voteDeadline: serializeVoteDeadline(doc),
    revealedAt: doc.revealedAt ? doc.revealedAt.toISOString() : null,
  };
}
