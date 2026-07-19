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
import { deleteRoomAndRounds } from "@/lib/roomLifetime";
import { RECONNECT_GRACE_MS } from "@/lib/gameTiming";
import {
  endGameIfAlone,
  reconcileAbandonedRoom,
} from "@/lib/reconcileAbandonedRoom";
import { revealIfVotingComplete } from "@/lib/revealIfVotingComplete";

/**
 * POST /api/room/:code/leave
 *
 * Soft leave (tab close / refresh beacon): mark disconnected and start a
 * reconnect grace window when < 2 players remain.
 *
 * Explicit Leave button: if < 2 remain, end the game immediately so the
 * other player is not stuck on submit/vote waiting screens.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.trim().toUpperCase();

  let body: {
    sessionId?: string;
    disconnectedAt?: number | string;
    /** "explicit" = Leave button; omit/unload = refresh / tab close */
    reason?: "explicit" | "unload";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const disconnectedAt =
    body.disconnectedAt != null ? new Date(body.disconnectedAt) : new Date(0);
  if (Number.isNaN(disconnectedAt.getTime())) {
    return NextResponse.json(
      { error: "Invalid disconnectedAt." },
      { status: 400 }
    );
  }

  const explicitLeave = body.reason === "explicit";

  await connectToDatabase();

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

  // How many would remain connected after this leave?
  const othersConnected = room.players.filter(
    (p: { sessionId: string; connected: boolean }) =>
      p.sessionId !== sessionId && p.connected
  ).length;

  const graceDeadline =
    room.status === "playing" && othersConnected < 2 && !explicitLeave
      ? new Date(Date.now() + RECONNECT_GRACE_MS)
      : null;

  const updated = await RoomModel.findOneAndUpdate(
    {
      roomCode,
      players: {
        $elemMatch: {
          sessionId,
          $or: [
            { lastSeenAt: { $exists: false } },
            { lastSeenAt: null },
            { lastSeenAt: { $lte: disconnectedAt } },
          ],
        },
      },
    },
    {
      $set: {
        "players.$.connected": false,
        ...(graceDeadline
          ? { abandonDeadline: graceDeadline }
          : room.status === "playing" && othersConnected >= 2
            ? { abandonDeadline: null }
            : {}),
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const channel = getRoomChannelName(roomCode);
  const serialized = serializeRoom(updated);
  const connectedPlayers = serialized.players.filter((p) => p.connected);

  let abandonDeadline: string | null = graceDeadline
    ? graceDeadline.toISOString()
    : null;
  let ended = false;

  if (updated.status === "waiting" && connectedPlayers.length === 0) {
    await deleteRoomAndRounds(roomCode);
    await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_LEFT, {
      sessionId,
      displayName,
      players: serialized.players,
      playerCount: 0,
      abandonDeadline: null,
    });
    trackActivity({
      type: "leave",
      request,
      route: "/api/room/[code]/leave",
      roomCode,
      sessionId,
      metadata: { deletedEmptyLobby: true },
    });
    return NextResponse.json({ success: true, deleted: true });
  }

  if (updated.status === "playing") {
    await revealIfVotingComplete(updated);
  }

  if (updated.status === "playing" && connectedPlayers.length < 2 && explicitLeave) {
    const result = await endGameIfAlone(roomCode);
    ended = Boolean(result?.ended);
    abandonDeadline = null;
  }

  const latest = await RoomModel.findOne({ roomCode }).lean();
  const playersOut = latest ? serializeRoom(latest).players : serialized.players;

  await pusherServer.trigger(channel, PUSHER_EVENTS.PLAYER_LEFT, {
    sessionId,
    displayName,
    players: playersOut,
    playerCount: playersOut.filter((p) => p.connected).length,
    abandonDeadline,
  });

  if (!ended) {
    await reconcileAbandonedRoom(roomCode);
  }

  trackActivity({
    type: "leave",
    request,
    route: "/api/room/[code]/leave",
    roomCode,
    sessionId,
    metadata: {
      explicitLeave,
      ended,
      ...(abandonDeadline ? { abandonDeadline } : {}),
    },
  });

  return NextResponse.json({ success: true, abandonDeadline, ended });
}
