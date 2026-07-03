import Pusher from "pusher";

const {
  PUSHER_APP_ID,
  NEXT_PUBLIC_PUSHER_KEY,
  PUSHER_SECRET,
  NEXT_PUBLIC_PUSHER_CLUSTER,
} = process.env;

if (
  !PUSHER_APP_ID ||
  !NEXT_PUBLIC_PUSHER_KEY ||
  !PUSHER_SECRET ||
  !NEXT_PUBLIC_PUSHER_CLUSTER
) {
  throw new Error(
    "Missing Pusher environment variables. Check your .env.local file against .env.example."
  );
}

/**
 * Server-side Pusher instance. Used inside API routes to trigger events
 * that get broadcast to all clients subscribed to a given room channel.
 *
 * This should NEVER be imported into client components — it holds the
 * secret key. Client components use src/lib/pusher/client.ts instead.
 */
export const pusherServer = new Pusher({
  appId: PUSHER_APP_ID,
  key: NEXT_PUBLIC_PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

/**
 * Naming convention: one channel per room, named "room-<roomCode>".
 * Keeping this as a helper avoids typos scattered across API routes.
 */
export function getRoomChannelName(roomCode: string): string {
  return `room-${roomCode}`;
}

/**
 * Event name constants, shared between server (trigger) and client (bind).
 * Centralizing these avoids subtle bugs from mistyped event name strings.
 */
export const PUSHER_EVENTS = {
  PLAYER_JOINED: "player-joined",
  PLAYER_LEFT: "player-left",
  GAME_STARTED: "game-started",
  STATEMENTS_SUBMITTED: "statements-submitted",
  VOTE_CAST: "vote-cast",
  ROUND_REVEALED: "round-revealed",
  ROUND_ROTATED: "round-rotated",
  GAME_ENDED: "game-ended",
} as const;