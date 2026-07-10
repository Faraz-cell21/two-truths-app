import { NextResponse } from "next/server";
import { requireAdmin, isAdminSession } from "@/lib/admin/requireAdmin";
import { getAdminStats } from "@/lib/admin/stats";

export async function GET() {
  const session = await requireAdmin();
  if (!isAdminSession(session)) return session;

  const stats = await getAdminStats();
  return NextResponse.json({ stats, admin: { email: session.email } });
}
