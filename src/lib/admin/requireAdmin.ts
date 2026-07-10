import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/config";
import {
  verifyAdminSessionToken,
  type AdminSessionPayload,
} from "@/lib/admin/session";

export async function requireAdmin(): Promise<
  AdminSessionPayload | NextResponse
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(token);

  if (!session) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return session;
}

export function isAdminSession(
  value: AdminSessionPayload | NextResponse
): value is AdminSessionPayload {
  return !(value instanceof NextResponse);
}
