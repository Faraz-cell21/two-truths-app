import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { serializeRoundPublicView } from "@/lib/serializeRound";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import type { SubmitRequestBody, SubmitResponse } from "@/types/api";
import { trackActivity } from "@/lib/admin/trackActivity";

const STATEMENT_MIN_LEN = 1;
const STATEMENT_MAX_LEN = 200;

/**
 * POST /api/round/submit
 *
 * The current round's submitter writes 3 statements (2 truths + 1 lie)
 * and marks which one is the lie. Idempotent — re-submitting the same
 * round returns the existing Round doc via the unique compound index.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SubmitResponse>> {
  let body: SubmitRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { roomCode, sessionId, statements, lieIndex } = body;

  // ---- Validate ----
  if (!roomCode || !sessionId) {
    return NextResponse.json(
      { error: "Missing roomCode or sessionId." },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(statements) ||
    statements.length !== 3 ||
    !statements.every(
      (s) =>
        typeof s === "string" &&
        s.trim().length >= STATEMENT_MIN_LEN &&
        s.trim().length <= STATEMENT_MAX_LEN
    )
  ) {
    return NextResponse.json(
      {
        error: `statements must be exactly 3 strings, each ${STATEMENT_MIN_LEN}-${STATEMENT_MAX_LEN} characters.`,
      },
      { status: 400 }
    );
  }

  if (lieIndex !== 0 && lieIndex !== 1 && lieIndex !== 2) {
    return NextResponse.json(
      { error: "lieIndex must be 0, 1, or 2." },
      { status: 400 }
    );
  }

  await connectToDatabase();

  // ---- Fetch room & verify it's this player's turn ----
  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  if (room.status !== "playing") {
    return NextResponse.json(
      { error: "Game has not started or is already finished." },
      { status: 409 }
    );
  }

  const roundNumber = room.currentRound;
  const submitterIndex = (roundNumber - 1) % room.players.length;
  const expectedSubmitter = room.players[submitterIndex].sessionId;

  if (sessionId !== expectedSubmitter) {
    return NextResponse.json(
      { error: "It is not your turn to submit statements." },
      { status: 403 }
    );
  }

  // ---- Create round (idempotent via unique compound index) ----
  let round;
  try {
    round = await RoundModel.create({
      roomCode,
      roundNumber,
      submittedBy: sessionId,
      statements: statements.map((s) => s.trim()) as [string, string, string],
      lieIndex,
      votes: [],
      revealedAt: null,
      createdAt: new Date(),
    });
  } catch (err: unknown) {
    const isDuplicate =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 11000;

    if (isDuplicate) {
      // Round already exists — return it as public view
      const existing = await RoundModel.findOne({
        roomCode,
        roundNumber,
      }).lean();
      if (existing) {
        return NextResponse.json({
          round: serializeRoundPublicView(existing),
        });
      }
    }
    throw err;
  }

  // ---- Notify room ----
  const channel = getRoomChannelName(roomCode);
  const publicView = serializeRoundPublicView(round.toObject());

  await pusherServer.trigger(channel, PUSHER_EVENTS.STATEMENTS_SUBMITTED, {
    round: publicView,
    roundNumber,
    submittedBy: sessionId,
  });

  trackActivity({
    type: "submit_statements",
    request,
    route: "/api/round/submit",
    roomCode,
    sessionId,
    metadata: { roundNumber },
  });

  return NextResponse.json({ round: publicView });
}
