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
 * POST /api/room/:code/start
 *
 * Starts a full waiting room — flips status to "playing", sets round to 1,
 * and broadcasts GAME_STARTED so all players in the lobby transition to
 * the game. Only works when every slot is filled by a connected player.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.trim().toUpperCase();

  await connectToDatabase();

  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (room.status !== "waiting") {
    return NextResponse.json(
      { error: "Room is not waiting for players." },
      { status: 409 }
    );
  }

  const connectedPlayers = room.players.filter(
    (p: { connected: boolean }) => p.connected
  );

  if (connectedPlayers.length < room.targetSize) {
    return NextResponse.json(
      { error: "Not all players are connected yet." },
      { status: 409 }
    );
  }

  // Atomically flip to playing — guards against races if multiple
  // lobby instances call this at the same time.
  const updated = await RoomModel.findOneAndUpdate(
    { roomCode, status: "waiting" },
    { $set: { status: "playing", currentRound: 1 } },
    { new: true }
  ).lean();

  if (!updated) {
    // Someone else already started it — that's fine
    return NextResponse.json({ started: true });
  }

  const channel = getRoomChannelName(roomCode);
  await pusherServer.trigger(channel, PUSHER_EVENTS.GAME_STARTED, {
    roundNumber: 1,
  });

  trackActivity({
    type: "start_game",
    request,
    route: "/api/room/[code]/start",
    roomCode,
    metadata: { source: "manual_start" },
  });

  const serialized = serializeRoom(updated);
  return NextResponse.json({ room: serialized });
}
