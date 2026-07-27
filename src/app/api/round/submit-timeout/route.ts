import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { reconcileSubmitDeadline } from "@/lib/reconcileSubmitDeadline";
import type { SubmitTimeoutResponse } from "@/types/api";

/**
 * POST /api/round/submit-timeout
 *
 * Client timer expiry (or any client) asks the server to close an expired
 * writing window. Idempotent — safe when multiple players fire at once.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SubmitTimeoutResponse>> {
  let body: { roomCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  if (!roomCode) {
    return NextResponse.json({ error: "Missing roomCode." }, { status: 400 });
  }

  await connectToDatabase();

  const result = await reconcileSubmitDeadline(roomCode);
  if (!result) {
    return NextResponse.json({ timedOut: false });
  }

  return NextResponse.json(result);
}
