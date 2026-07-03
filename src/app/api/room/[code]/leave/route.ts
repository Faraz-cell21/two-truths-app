import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { serializeRoom } from "@/lib/serializeRoom";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";

/**
 * POST /api/room/:code/leave
 *
 * Marks a player as disconnected. Called on tab close / navigation away
 * via a beforeunload handler. Does NOT remove the player from the room
 * — they can rejoin within the grace period.
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

  // Notify the room
  const channel = getRoomChannelName(roomCode);
  const room = serializeRoom(updated);

  await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_LEFT, {
    sessionId,
    players: room.players,
    playerCount: room.players.filter((p) => p.connected).length,
  });

  return NextResponse.json({ success: true });
}
