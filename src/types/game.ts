export type RoomMode = "random" | "private";
export type RoomStatus = "waiting" | "playing" | "finished";
export type TargetSize = 2 | 3 | 4 | 5;

export interface Player {
  sessionId: string;
  displayName: string;
  /** Unique seat color token within the room. */
  avatarColor: string;
  joinedAt: string;
  connected: boolean;
  score: number;
}

export interface Room {
  roomCode: string;
  mode: RoomMode;
  targetSize: TargetSize;
  status: RoomStatus;
  currentRound: number;
  players: Player[];
  createdAt: string;
  expiresAt: string;
}

export interface Vote {
  sessionId: string;
  votedIndex: 0 | 1 | 2;
}

export interface Round {
  roomCode: string;
  roundNumber: number;
  submittedBy: string;
  statements: [string, string, string];
  lieIndex: 0 | 1 | 2;
  votes: Vote[];
  /** ISO timestamp — voting closes at this server-authored deadline. */
  voteDeadline: string;
  revealedAt: string | null;
  createdAt: string;
}

/**
 * Shape sent to OTHER players before reveal — lieIndex is stripped out
 * so the client never receives the answer early via the browser network tab.
 */
export interface RoundPublicView {
  roomCode: string;
  roundNumber: number;
  submittedBy: string;
  statements: [string, string, string];
  votes: Vote[];
  voteDeadline: string;
  revealedAt: string | null;
}

/** Per-player score change after a round is revealed. */
export interface ScoreDelta {
  sessionId: string;
  displayName: string;
  delta: number;
  reason: "correct-guess" | "fooled" | "none";
}