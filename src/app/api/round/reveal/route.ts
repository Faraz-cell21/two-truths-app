import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoundModel } from "@/models/Round";
import { RoomModel } from "@/models/Room";
import { performReveal } from "@/lib/revealRound";
import { isVoteDeadlinePassed } from "@/lib/gameTiming";
import type { RevealRequestBody, RevealResponse } from "@/types/api";
import { trackActivity } from "@/lib/admin/trackActivity";

/**
 * POST /api/round/reveal
 *
 * Closes voting after the server voteDeadline (timer expiry) or when
 * every eligible vote is already in. Idempotent if already revealed.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<RevealResponse>> {
  let body: RevealRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { roomCode, roundNumber } = body;

  if (!roomCode || roundNumber == null) {
    return NextResponse.json(
      { error: "Missing roomCode or roundNumber." },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }

  // Already revealed — return idempotent result.
  if (!round.revealedAt) {
    const deadlinePassed = isVoteDeadlinePassed(round);
    if (!deadlinePassed) {
      const room = await RoomModel.findOne({ roomCode }).lean();
      const eligibleVoters = room
        ? room.players.filter(
            (p: { sessionId: string; connected: boolean }) =>
              p.sessionId !== round.submittedBy && p.connected
          ).length
        : 0;
      const allVotesIn =
        eligibleVoters === 0 || round.votes.length >= eligibleVoters;

      if (!allVotesIn) {
        return NextResponse.json(
          { error: "Voting is still open." },
          { status: 409 }
        );
      }
    }
  }

  const result = await performReveal(roomCode, roundNumber);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  trackActivity({
    type: "reveal",
    request,
    route: "/api/round/reveal",
    roomCode,
    metadata: { roundNumber, source: "timeout_or_manual" },
  });

  return NextResponse.json(result);
}
