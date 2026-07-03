import { Room, TargetSize } from "./game";

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