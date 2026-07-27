import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { beginSubmitWindow } from "@/lib/beginSubmitWindow";

/**
 * POST /api/round/begin-submit
 *
 * Called when a client enters the writing UI. Starts the shared 90s
 * server deadline (once per turn). Safe for every player to call.
 */
export async function POST(request: NextRequest) {
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
  const result = await beginSubmitWindow(roomCode);
  if (!result) {
    return NextResponse.json(
      { error: "Writing window is not available." },
      { status: 409 }
    );
  }

  return NextResponse.json(result);
}
