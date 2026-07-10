import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAdminSession } from "@/lib/admin/requireAdmin";
import { runCleanup, type CleanupAction } from "@/lib/admin/stats";

const VALID_ACTIONS: CleanupAction[] = [
  "purge_activity",
  "delete_finished_rooms",
  "delete_stale_rooms",
  "delete_all_rounds",
  "purge_all_game_data",
];

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!isAdminSession(session)) return session;

  let body: { action?: CleanupAction; olderThanDays?: number };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid cleanup action." }, { status: 400 });
  }

  const olderThanDays =
    typeof body.olderThanDays === "number" && body.olderThanDays > 0
      ? Math.floor(body.olderThanDays)
      : 7;

  const result = await runCleanup(action, olderThanDays);
  return NextResponse.json({ ok: true, action, result });
}
