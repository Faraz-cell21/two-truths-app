import { Room, Round, RoundPublicView, Vote, ScoreDelta, TargetSize } from "./game";

/**
 * The three ways a client can hit /api/join:
 * - "random": find or create a random-matchmaking room of the given size
 * - "create-private": create a new invite-only room and return its code
 * - "join-private": join an existing room by its roomCode
 */
export type JoinAction = "random" | "create-private" | "join-private";

export interface JoinRequestBody {
  action: JoinAction;
  sessionId: string;
  displayName: string;
  targetSize?: TargetSize; // required for "random" and "create-private"
  roomCode?: string; // required for "join-private"
}

export interface JoinSuccessResponse {
  room: Room;
}

export interface JoinErrorResponse {
  error: string;
}

export type JoinResponse = JoinSuccessResponse | JoinErrorResponse;

// ============================================================
// Round — submit statements
// ============================================================

export interface SubmitRequestBody {
  roomCode: string;
  sessionId: string;
  statements: [string, string, string];
  lieIndex: 0 | 1 | 2;
}

export interface SubmitSuccessResponse {
  round: RoundPublicView;
}

export type SubmitResponse = SubmitSuccessResponse | { error: string };

// ============================================================
// Round — vote
// ============================================================

export interface VoteRequestBody {
  roomCode: string;
  roundNumber: number;
  sessionId: string;
  votedIndex: 0 | 1 | 2;
}

export interface VoteSuccessResponse {
  vote: Vote;
  votesRemaining: number;
}

export type VoteResponse = VoteSuccessResponse | { error: string };

// ============================================================
// Round — reveal
// ============================================================

export interface RevealRequestBody {
  roomCode: string;
  roundNumber: number;
}

export interface RevealSuccessResponse {
  round: Round;
  scoreDeltas: ScoreDelta[];
  scores: Array<{ sessionId: string; displayName: string; score: number }>;
  nextRound: number | null;
  nextSubmitter: { sessionId: string; displayName: string } | null;
  gameEnded: boolean;
}

export type RevealResponse = RevealSuccessResponse | { error: string };

// ============================================================
// Round — GET current round state
// ============================================================

export interface RoundGetSuccessResponse {
  round: Round | RoundPublicView;
  scoreDeltas: ScoreDelta[] | null;
  gameEnded: boolean;
}

export type RoundGetResponse = RoundGetSuccessResponse | { error: string };
