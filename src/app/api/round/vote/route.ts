import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { performReveal } from "@/lib/revealRound";
import { revealIfVoteDeadlinePassed } from "@/lib/reconcileVoteDeadline";
import { isVoteDeadlinePassed, VOTE_DURATION_MS } from "@/lib/gameTiming";
import {
  pusherServer,
  getRoomChannelName,
  PUSHER_EVENTS,
} from "@/lib/pusher/server";
import type { VoteRequestBody, VoteResponse } from "@/types/api";
import type { Vote } from "@/types/game";
import { trackActivity } from "@/lib/admin/trackActivity";

/**
 * POST /api/round/vote
 *
 * A non-submitter player casts their vote for which statement they
 * believe is the lie. If this vote is the last one needed, the round
 * is auto-revealed inline. Votes after the server voteDeadline are rejected.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<VoteResponse>> {
  let body: VoteRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { roomCode, roundNumber, sessionId, votedIndex } = body;

  if (!roomCode || !sessionId || roundNumber == null) {
    return NextResponse.json(
      { error: "Missing roomCode, roundNumber, or sessionId." },
      { status: 400 }
    );
  }

  if (votedIndex !== 0 && votedIndex !== 1 && votedIndex !== 2) {
    return NextResponse.json(
      { error: "votedIndex must be 0, 1, or 2." },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const round = await RoundModel.findOne({ roomCode, roundNumber }).lean();
  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }
  if (round.revealedAt) {
    return NextResponse.json(
      { error: "This round has already been revealed." },
      { status: 409 }
    );
  }

  const reconciled = await revealIfVoteDeadlinePassed(
    roomCode,
    roundNumber,
    round
  );
  if (reconciled) {
    return NextResponse.json({ error: "Voting has ended." }, { status: 409 });
  }

  if (round.submittedBy === sessionId) {
    return NextResponse.json(
      { error: "The submitter cannot vote on their own round." },
      { status: 403 }
    );
  }
  if (round.votes.some((v: { sessionId: string }) => v.sessionId === sessionId)) {
    return NextResponse.json(
      { error: "You have already voted this round." },
      { status: 409 }
    );
  }

  const room = await RoomModel.findOne({ roomCode }).lean();
  if (!room || room.status !== "playing") {
    return NextResponse.json(
      { error: "Game is not active." },
      { status: 409 }
    );
  }

  const now = new Date();
  const openFilter: Record<string, unknown> = {
    _id: round._id,
    revealedAt: null,
    "votes.sessionId": { $ne: sessionId },
  };
  if (round.voteDeadline) {
    openFilter.voteDeadline = { $gt: now };
  } else {
    // Legacy rounds without voteDeadline — use createdAt + duration.
    openFilter.createdAt = {
      $gt: new Date(now.getTime() - VOTE_DURATION_MS),
    };
  }

  const updated = await RoundModel.findOneAndUpdate(
    openFilter,
    { $push: { votes: { sessionId, votedIndex } } },
    { new: true }
  ).lean();

  if (!updated) {
    const latest = await RoundModel.findById(round._id).lean();
    if (latest && (latest.revealedAt || isVoteDeadlinePassed(latest, now))) {
      await revealIfVoteDeadlinePassed(roomCode, roundNumber, latest);
      return NextResponse.json({ error: "Voting has ended." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "You have already voted this round." },
      { status: 409 }
    );
  }

  const vote: Vote = { sessionId, votedIndex };
  const eligibleVoters = room.players.filter(
    (p: { sessionId: string; connected: boolean }) =>
      p.sessionId !== round.submittedBy && p.connected
  ).length;
  const votesRemaining = eligibleVoters - updated.votes.length;

  const channel = getRoomChannelName(roomCode);
  await pusherServer.trigger(channel, PUSHER_EVENTS.VOTE_CAST, {
    sessionId,
    votedIndex,
    votes: updated.votes,
    votesRemaining,
  });

  trackActivity({
    type: "vote",
    request,
    route: "/api/round/vote",
    roomCode,
    sessionId,
    metadata: {
      roundNumber,
      isCorrect: votedIndex === round.lieIndex,
    },
  });

  if (votesRemaining === 0) {
    const revealResult = await performReveal(roomCode, roundNumber);
    if ("error" in revealResult) {
      return NextResponse.json(
        { error: revealResult.error },
        { status: revealResult.status }
      );
    }
    trackActivity({
      type: "reveal",
      request,
      route: "/api/round/vote",
      roomCode,
      sessionId,
      metadata: { roundNumber, source: "auto_reveal" },
    });
    return NextResponse.json({ vote, votesRemaining: 0 });
  }

  return NextResponse.json({ vote, votesRemaining });
}
