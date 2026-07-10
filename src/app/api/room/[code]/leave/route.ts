import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { serializeRoom } from "@/lib/serializeRoom";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import { trackActivity } from "@/lib/admin/trackActivity";

/**
 * POST /api/room/:code/leave
 *
 * Marks a player as disconnected. Called on tab close / navigation away
 * via a beforeunload handler. Does NOT remove the player from the room
 * — they can rejoin within the grace period.
 *
 * If the game is in progress and only 1 connected player remains, the
 * game is force-ended since 1-player games are not playable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.trim().toUpperCase();

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  await connectToDatabase();

  // Fetch room to get the player's display name before marking disconnected
  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const player = room.players.find(
    (p: { sessionId: string; displayName: string }) => p.sessionId === sessionId
  );
  if (!player) {
    return NextResponse.json(
      { error: "Player not in room." },
      { status: 404 }
    );
  }

  const displayName = player.displayName;

  // Atomically mark the player as disconnected
  const updated = await RoomModel.findOneAndUpdate(
    { roomCode, "players.sessionId": sessionId },
    { $set: { "players.$.connected": false } },
    { new: true }
  ).lean();

  if (!updated) {
    return NextResponse.json(
      { error: "Room or player not found." },
      { status: 404 }
    );
  }

  const channel = getRoomChannelName(roomCode);
  const serialized = serializeRoom(updated);
  const connectedPlayers = serialized.players.filter((p) => p.connected);

  // Notify the room about the player leaving
  await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_LEFT, {
    sessionId,
    displayName,
    players: serialized.players,
    playerCount: connectedPlayers.length,
  });

  // If the game is in progress and only 0-1 connected players remain,
  // force-end — you can't play alone.
  if (
    updated.status === "playing" &&
    connectedPlayers.length < 2
  ) {
    await RoomModel.updateOne(
      { roomCode },
      { $set: { status: "finished" } }
    );

    const scores = serialized.players.map((p) => ({
      sessionId: p.sessionId,
      displayName: p.displayName,
      score: p.score,
    }));

    // Determine winner (if any) among remaining connected players
    const highestScore = Math.max(...connectedPlayers.map((p) => p.score), 0);

    await pusherServer.trigger(channel, PUSHER_EVENTS.GAME_ENDED, {
      scores,
      reason: "not-enough-players",
      message: `Not enough players: ${displayName} left and the game cannot continue.`,
    });
  }

  trackActivity({
    type: "leave",
    request,
    route: "/api/room/[code]/leave",
    roomCode,
    sessionId,
  });

  return NextResponse.json({ success: true });
}
