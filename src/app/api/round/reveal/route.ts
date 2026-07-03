import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { performReveal } from "@/lib/revealRound";
import type { RevealRequestBody, RevealResponse } from "@/types/api";

/**
 * POST /api/round/reveal
 *
 * Triggers reveal + scoring for a round. Can be called manually (e.g.
 * when a voting timer expires) or as a fallback if auto-reveal fails.
 * Idempotent — calling twice returns the same result.
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

  const result = await performReveal(roomCode, roundNumber);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}
