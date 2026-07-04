import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { generateRoomCode } from "@/lib/roomCode";
import { serializeRoom } from "@/lib/serializeRoom";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import type { JoinRequestBody, JoinResponse } from "@/types/api";
import type { Room, TargetSize } from "@/types/game";

const VALID_TARGET_SIZES: TargetSize[] = [2, 3, 4, 5];
const ROOM_LIFETIME_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_ROOM_CODE_ATTEMPTS = 5;

/**
 * Notifies everyone already in the room (via Pusher) that a new player
 * has joined, and flips the room to "playing" if this join filled the
 * last slot.
 */
async function announceJoinAndMaybeStart(room: Room) {
  const channel = getRoomChannelName(room.roomCode);

  await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_JOINED, {
    players: room.players,
    playerCount: room.players.length,
    targetSize: room.targetSize,
  });

  if (room.players.length === room.targetSize && room.status === "playing") {
    await pusherServer.trigger(channel, PUSHER_EVENTS.GAME_STARTED, {
      roundNumber: 1,
    });
  }
}

/**
 * Atomically adds a player to a room if there's a free slot, and flips
 * the room to "playing" if that join fills it. Uses a single
 * findOneAndUpdate with a $expr size check so two simultaneous joins
 * can't both succeed and overfill the room.
 */
async function addPlayerToRoom(
  filter: Record<string, unknown>,
  sessionId: string,
  displayName: string
) {
  const newPlayer = {
    sessionId,
    displayName,
    joinedAt: new Date(),
    connected: true,
    score: 0,
  };

  const fullFilter = {
    ...filter,
    "players.sessionId": { $ne: sessionId }, // avoid duplicate join by same session
  };

  const updated = await RoomModel.findOneAndUpdate(
    fullFilter,
    { $push: { players: newPlayer } },
    { new: true }
  ).lean();

  if (!updated) {
    return null;
  }

  // If that join filled the room, flip status to "playing" in a second
  // atomic update, guarded so only the join that actually fills it wins.
  if (updated.players.length === updated.targetSize) {
    const started = await RoomModel.findOneAndUpdate(
      {
        roomCode: updated.roomCode,
        status: "waiting",
        $expr: { $eq: [{ $size: "$players" }, "$targetSize"] },
      },
      { $set: { status: "playing", currentRound: 1 } },
      { new: true }
    ).lean();

    if (started) {
      return started;
    }
  }

  return updated;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<JoinResponse>> {
  let body: JoinRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { action, sessionId, displayName } = body;

  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const trimmedName = (displayName || "").trim();
  if (!trimmedName || trimmedName.length > 30) {
    return NextResponse.json(
      { error: "Display name must be between 1 and 30 characters." },
      { status: 400 }
    );
  }

  if (action !== "random" && action !== "create-private" && action !== "join-private") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  await connectToDatabase();

  // Remove this session from any other rooms they were in, so they don't
  // linger as a ghost player in a previous lobby or game.
  await RoomModel.updateMany(
    { "players.sessionId": sessionId, roomCode: { $ne: body.roomCode ?? "" } },
    { $pull: { players: { sessionId } } }
  );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_LIFETIME_MS);

  // ---- Action: random matchmaking ----
  if (action === "random") {
    const targetSize = body.targetSize;
    if (!targetSize || !VALID_TARGET_SIZES.includes(targetSize)) {
      return NextResponse.json(
        { error: "targetSize must be 2, 3, 4, or 5." },
        { status: 400 }
      );
    }

    // Try to join an existing open room of this size first.
    const joined = await addPlayerToRoom(
      {
        mode: "random",
        targetSize,
        status: "waiting",
        $expr: { $lt: [{ $size: "$players" }, targetSize] },
      },
      sessionId,
      trimmedName
    );

    if (joined) {
      const room = serializeRoom(joined);
      await announceJoinAndMaybeStart(room);
      return NextResponse.json({ room });
    }

    // No open room found — create a new one with this player as the first.
    const created = await RoomModel.create({
      roomCode: generateRoomCode(),
      mode: "random",
      targetSize,
      status: "waiting",
      currentRound: 0,
      players: [
        {
          sessionId,
          displayName: trimmedName,
          joinedAt: now,
          connected: true,
          score: 0,
        },
      ],
      createdAt: now,
      expiresAt,
    });

    const room = serializeRoom(created.toObject());
    return NextResponse.json({ room });
  }

  // ---- Action: create a private room ----
  if (action === "create-private") {
    const targetSize = body.targetSize;
    if (!targetSize || !VALID_TARGET_SIZES.includes(targetSize)) {
      return NextResponse.json(
        { error: "targetSize must be 2, 3, 4, or 5." },
        { status: 400 }
      );
    }

    // Room codes aren't guaranteed unique by construction, so retry a
    // few times on the rare collision instead of trusting one attempt.
    let created = null;
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
      try {
        created = await RoomModel.create({
          roomCode: generateRoomCode(),
          mode: "private",
          targetSize,
          status: "waiting",
          currentRound: 0,
          players: [
            {
              sessionId,
              displayName: trimmedName,
              joinedAt: now,
              connected: true,
              score: 0,
            },
          ],
          createdAt: now,
          expiresAt,
        });
        break;
      } catch (err: unknown) {
        const isDuplicateKeyError =
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: number }).code === 11000;
        if (!isDuplicateKeyError) throw err;
        // otherwise loop and try a new random code
      }
    }

    if (!created) {
      return NextResponse.json(
        { error: "Could not generate a unique room code. Please try again." },
        { status: 500 }
      );
    }

    const room = serializeRoom(created.toObject());
    return NextResponse.json({ room });
  }

  // ---- Action: join a private room by code ----
  if (action === "join-private") {
    const roomCode = (body.roomCode || "").trim().toUpperCase();
    if (!roomCode) {
      return NextResponse.json({ error: "Missing roomCode." }, { status: 400 });
    }

    const existingRoom = await RoomModel.findOne({ roomCode }).lean();

    if (!existingRoom) {
      return NextResponse.json(
        { error: "Room not found. Check the code and try again." },
        { status: 404 }
      );
    }

    if (existingRoom.status !== "waiting") {
      return NextResponse.json(
        { error: "This game has already started or finished." },
        { status: 409 }
      );
    }

    const joined = await addPlayerToRoom(
      {
        roomCode,
        status: "waiting",
        $expr: { $lt: [{ $size: "$players" }, "$targetSize"] },
      },
      sessionId,
      trimmedName
    );

    if (!joined) {
      return NextResponse.json(
        { error: "This room is already full." },
        { status: 409 }
      );
    }

    const room = serializeRoom(joined);
    await announceJoinAndMaybeStart(room);
    return NextResponse.json({ room });
  }

  // Unreachable, but keeps TypeScript satisfied about all paths returning.
  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}