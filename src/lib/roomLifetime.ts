import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import type { RoomMode } from "@/types/game";

/** Idle lobby: expire if it never fills. */
export const LOBBY_IDLE_MS: Record<RoomMode, number> = {
  random: 5 * 60 * 1000,
  private: 10 * 60 * 1000,
};

/** Active game lifetime (safety net via Mongo TTL). */
export const PLAYING_LIFETIME_MS = 1 * 60 * 60 * 1000;

/**
 * After a game finishes, keep the room briefly so players can hit
 * "Play again", then Mongo TTL deletes the room document.
 * Rounds are removed explicitly on play-again reset and when a lobby is
 * hard-deleted; otherwise Round TTL (~1h) is the safety net.
 */
export const FINISHED_CLEANUP_MS = 30 * 60 * 1000;

export function lobbyExpiresAt(
  mode: RoomMode,
  from: Date = new Date()
): Date {
  return new Date(from.getTime() + LOBBY_IDLE_MS[mode]);
}

export function playingExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PLAYING_LIFETIME_MS);
}

export function finishedExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + FINISHED_CLEANUP_MS);
}

export function isExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/** Hard-delete a room and all of its rounds. */
export async function deleteRoomAndRounds(roomCode: string): Promise<void> {
  await Promise.all([
    RoomModel.deleteOne({ roomCode }),
    RoundModel.deleteMany({ roomCode }),
  ]);
}
