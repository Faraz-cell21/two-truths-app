"use client";

import PusherClient from "pusher-js";

let pusherClientInstance: PusherClient | null = null;

/**
 * Returns a singleton Pusher client instance for the browser.
 * We lazily create it once and reuse it, rather than creating a new
 * connection every time a component mounts.
 */
export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      throw new Error(
        "Missing NEXT_PUBLIC_PUSHER_KEY or NEXT_PUBLIC_PUSHER_CLUSTER environment variables."
      );
    }

    pusherClientInstance = new PusherClient(key, {
      cluster,
    });
  }

  return pusherClientInstance;
}

export function getRoomChannelName(roomCode: string): string {
  return `room-${roomCode}`;
}

export const PUSHER_EVENTS = {
  PLAYER_JOINED: "player-joined",
  PLAYER_LEFT: "player-left",
  GAME_STARTED: "game-started",
  STATEMENTS_SUBMITTED: "statements-submitted",
  VOTE_CAST: "vote-cast",
  ROUND_REVEALED: "round-revealed",
  ROUND_ROTATED: "round-rotated",
  GAME_ENDED: "game-ended",
  PLAY_AGAIN_REQUESTED: "play-again-requested",
} as const;