import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { serializeRoom } from "@/lib/serializeRoom";

/**
 * GET /api/room/:code
 *
 * Returns the current state of a room — used by the lobby page on initial
 * load and for reconnection after a page refresh. Does not mutate anything;
 * this is a pure read.
 */
export async function GET(
  _request: NextRequest,
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

  const room = await RoomModel.findOne({ roomCode }).lean();

  if (!room) {
    return NextResponse.json(
      { error: "Room not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ room: serializeRoom(room) });
}
