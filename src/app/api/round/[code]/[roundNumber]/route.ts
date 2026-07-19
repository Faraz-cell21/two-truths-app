import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { serializeRound, serializeRoundPublicView } from "@/lib/serializeRound";
import { computeScoreDeltas } from "@/lib/revealRound";
import { revealIfVoteDeadlinePassed } from "@/lib/reconcileVoteDeadline";
import type { RoundGetResponse } from "@/types/api";
import { trackActivity } from "@/lib/admin/trackActivity";

/**
 * GET /api/round/:code/:roundNumber
 *
 * Returns round state for the game page on load or reconnect.
 * Accepts ?sessionId= to determine the correct view:
 *   - Already revealed → full Round + score deltas (everyone can see)
 *   - Not revealed + requestor is submitter → full Round
 *   - Not revealed + requestor is not submitter → RoundPublicView
 *
 * Also reconciles an expired voteDeadline into a reveal when needed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; roundNumber: string }> }
) {
  const { code, roundNumber: roundStr } = await params;
  const roomCode = code.trim().toUpperCase();
  const roundNumber = parseInt(roundStr, 10);

  if (isNaN(roundNumber) || roundNumber < 1) {
    return NextResponse.json(
      { error: "Invalid round number." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId") || undefined;

  await connectToDatabase();

  let round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }

  // Lazy reveal if the client reconnects after the voting window.
  if (!round.revealedAt) {
    const reconciled = await revealIfVoteDeadlinePassed(
      roomCode,
      roundNumber,
      round
    );
    if (reconciled) {
      round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
      if (!round) {
        return NextResponse.json({ error: "Round not found." }, { status: 404 });
      }
    }
  }

  const room = await RoomModel.findOne({ roomCode }).lean();
  const totalRounds = room ? room.players.length : 0;
  const gameEnded = roundNumber >= totalRounds;

  trackActivity({
    type: "round_fetch",
    request,
    route: "/api/round/[code]/[roundNumber]",
    roomCode,
    sessionId,
    metadata: { roundNumber },
  });

  if (round.revealedAt) {
    const scoreDeltas = computeScoreDeltas(round, room?.players ?? []);
    return NextResponse.json({
      round: serializeRound(round),
      scoreDeltas,
      gameEnded,
    } satisfies RoundGetResponse);
  }

  if (sessionId && sessionId === round.submittedBy) {
    return NextResponse.json({
      round: serializeRound(round),
      scoreDeltas: null,
      gameEnded,
    } satisfies RoundGetResponse);
  }

  return NextResponse.json({
    round: serializeRoundPublicView(round),
    scoreDeltas: null,
    gameEnded,
  } satisfies RoundGetResponse);
}
