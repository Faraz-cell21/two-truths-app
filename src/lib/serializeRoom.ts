import type { Room, TargetSize } from "@/types/game";
import { avatarColorAt } from "@/lib/avatarTokens";

/**
 * Raw shape that comes back from a Mongoose `.lean()` call on a Room
 * document — Dates are still Date objects, not ISO strings, and Mongoose
 * may add _id / __v fields we never want to leak to the client.
 */
export interface LeanRoomDocument {
  roomCode: string;
  mode: "random" | "private";
  targetSize: number;
  status: "waiting" | "playing" | "finished";
  currentRound: number;
  players: Array<{
    sessionId: string;
    displayName: string;
    avatarColor?: string;
    joinedAt: Date;
    connected: boolean;
    score: number;
  }>;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Converts a Mongoose lean document into the plain Room shape our API
 * and client code expect, so we're never leaking Mongoose internals
 * (like _id, __v, or Date objects instead of ISO strings) to the
 * frontend.
 *
 * Shared between /api/join and /api/room/[code] so the serialization
 * contract stays consistent across every endpoint that returns a Room.
 */
export function serializeRoom(doc: LeanRoomDocument): Room {
  return {
    roomCode: doc.roomCode,
    mode: doc.mode,
    targetSize: doc.targetSize as TargetSize,
    status: doc.status,
    currentRound: doc.currentRound,
    players: doc.players.map((p, index) => ({
      sessionId: p.sessionId,
      displayName: p.displayName,
      avatarColor: p.avatarColor || avatarColorAt(index),
      joinedAt: p.joinedAt.toISOString(),
      connected: p.connected,
      score: p.score,
    })),
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
  };
}
