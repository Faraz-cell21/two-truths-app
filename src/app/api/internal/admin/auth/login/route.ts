import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { AdminModel } from "@/models/Admin";
import { verifyPassword } from "@/lib/admin/password";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
} from "@/lib/admin/config";
import { createAdminSessionToken } from "@/lib/admin/session";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const admin = await AdminModel.findOne({ email }).lean();
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await AdminModel.updateOne(
    { _id: admin._id },
    { $set: { lastLoginAt: new Date() } }
  );

  const token = await createAdminSessionToken(
    {
      sub: String(admin._id),
      email: admin.email,
    },
    ADMIN_SESSION_TTL_MS
  );

  const response = NextResponse.json({ ok: true, email: admin.email });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });

  return response;
}
