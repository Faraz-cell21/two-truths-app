import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { serializeRoom } from "@/lib/serializeRoom";
import { trackActivity } from "@/lib/admin/trackActivity";
import {
  deleteRoomAndRounds,
  isExpired,
} from "@/lib/roomLifetime";
import { reconcileAbandonedRoom } from "@/lib/reconcileAbandonedRoom";

/**
 * GET /api/room/:code
 *
 * Returns the current state of a room — used by the lobby page on initial
 * load and for reconnection after a page refresh.
 *
 * Waiting lobbies past expiresAt are deleted permanently (410).
 * Also reconciles an expired reconnect-grace abandon into finished.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.trim().toUpperCase();

  if (!roomCode) {
    return NextResponse.json(
      { error: "Missing room code." },
      { status: 400 }
    );
  }

  await connectToDatabase();

  let room = await RoomModel.findOne({ roomCode }).lean();

  if (!room) {
    return NextResponse.json(
      { error: "Room not found." },
      { status: 404 }
    );
  }

  const abandoned = await reconcileAbandonedRoom(roomCode, room);
  if (abandoned) {
    room = abandoned.room;
  }

  if (isExpired(room.expiresAt as Date)) {
    if (room.status === "waiting" || room.status === "finished") {
      await deleteRoomAndRounds(roomCode);
      return NextResponse.json(
        {
          error:
            room.status === "waiting"
              ? "This lobby expired because no one joined in time."
              : "This room has been cleaned up.",
        },
        { status: 410 }
      );
    }
  }

  trackActivity({
    type: "room_fetch",
    request,
    route: "/api/room/[code]",
    roomCode,
  });

  return NextResponse.json({ room: serializeRoom(room) });
}
