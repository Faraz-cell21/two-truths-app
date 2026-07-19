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
import { reconcileAbandonedRoom } from "@/lib/reconcileAbandonedRoom";

/**
 * POST /api/room/:code/rejoin
 *
 * Called when a returning player (with an existing sessionId already in
 * the room's player list) reconnects — after a page refresh, tab close,
 * or network drop. Marks them as connected again and clears any
 * abandon deadline so a mid-game refresh doesn't end the match.
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

  // If grace already elapsed, finish the game before allowing rejoin.
  const abandoned = await reconcileAbandonedRoom(roomCode);
  if (abandoned?.ended) {
    return NextResponse.json(
      { error: "This game has already ended." },
      { status: 410 }
    );
  }

  const room = abandoned?.room ?? (await RoomModel.findOne({ roomCode }).lean());
  if (!room) {
    return NextResponse.json(
      { error: "Room not found. It may have expired." },
      { status: 404 }
    );
  }

  if (room.status === "finished") {
    return NextResponse.json(
      { error: "This game has already ended." },
      { status: 410 }
    );
  }

  const playerInRoom = room.players.find(
    (p: { sessionId: string; connected: boolean }) => p.sessionId === sessionId
  );
  if (!playerInRoom) {
    return NextResponse.json(
      { error: "You are not a player in this room." },
      { status: 403 }
    );
  }

  let updatedRoom = room;
  if (!playerInRoom.connected || room.abandonDeadline) {
    const now = new Date();
    const updated = await RoomModel.findOneAndUpdate(
      { roomCode, "players.sessionId": sessionId, status: { $ne: "finished" } },
      {
        $set: {
          "players.$.connected": true,
          "players.$.lastSeenAt": now,
          abandonDeadline: null,
        },
      },
      { new: true }
    ).lean();

    if (updated) {
      updatedRoom = updated;

      const channel = getRoomChannelName(roomCode);
      const serialized = serializeRoom(updated);
      await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_JOINED, {
        players: serialized.players,
        playerCount: serialized.players.filter((p) => p.connected).length,
        targetSize: serialized.targetSize,
      });
    }
  } else {
    // Still bump lastSeenAt so a late leave beacon from a prior refresh is ignored.
    await RoomModel.updateOne(
      { roomCode, "players.sessionId": sessionId },
      { $set: { "players.$.lastSeenAt": new Date() } }
    );
  }

  trackActivity({
    type: "rejoin",
    request,
    route: "/api/room/[code]/rejoin",
    roomCode,
    sessionId,
  });

  return NextResponse.json({ room: serializeRoom(updatedRoom) });
}
