import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { serializeRoom } from "@/lib/serializeRoom";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";

/**
 * POST /api/room/:code/play-again
 *
 * Resets a finished room back to "waiting" so the same group can play
 * again without re-sharing the room code. Clears scores, deletes all
 * rounds, and notifies every player via Pusher that someone wants to
 * play again.
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

  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  // Allow both "finished" (first player to click) and "waiting"
  // (subsequent players accepting the invite — room was already reset).
  if (room.status !== "finished" && room.status !== "waiting") {
    return NextResponse.json(
      { error: "This game is still in progress." },
      { status: 409 }
    );
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

  const initiatorName = player.displayName;
  const channel = getRoomChannelName(roomCode);

  // If room was already reset by someone else, mark this player as
  // connected (they accepted the invite) and notify the room.
  if (room.status === "waiting") {
    const wasDisconnected = !player.connected;

    await RoomModel.updateOne(
      { roomCode, "players.sessionId": sessionId },
      { $set: { "players.$.connected": true } }
    );

    if (wasDisconnected) {
      const updatedRoom = await RoomModel.findOne({ roomCode }).lean();
      if (updatedRoom) {
        const serialized = serializeRoom(updatedRoom);
        await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_JOINED, {
          players: serialized.players,
          playerCount: serialized.players.filter((p) => p.connected).length,
          targetSize: serialized.targetSize,
        });
        return NextResponse.json({ room: serialized });
      }
    }

    const serialized = serializeRoom(room);
    return NextResponse.json({ room: serialized });
  }

  // Reset room to waiting state, clear all scores, disconnect everyone
  const updated = await RoomModel.findOneAndUpdate(
    { roomCode },
    {
      $set: {
        status: "waiting",
        currentRound: 0,
        "players.$[].score": 0,
        "players.$[].connected": false,
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to reset room." },
      { status: 500 }
    );
  }

  // Mark the initiator as connected (they just navigated to the lobby)
  await RoomModel.updateOne(
    { roomCode, "players.sessionId": sessionId },
    { $set: { "players.$.connected": true } }
  );

  // Delete all rounds for this room
  await RoundModel.deleteMany({ roomCode });

  // Notify all players that someone wants to play again
  const serialized = serializeRoom(updated);
  // Update the initiator's connected status in the serialized response
  const initiatorPlayer = serialized.players.find((p) => p.sessionId === sessionId);
  if (initiatorPlayer) initiatorPlayer.connected = true;

  await pusherServer.trigger(channel, PUSHER_EVENTS.PLAY_AGAIN_REQUESTED, {
    initiatedBy: initiatorName,
    room: serialized,
  });

  return NextResponse.json({ room: serialized });
}
