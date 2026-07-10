import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminPath } from "@/lib/admin/config";
import { verifyAdminSessionToken } from "@/lib/admin/session";

function isPublicAdminPath(pathname: string, adminPath: string): boolean {
  const base = `/${adminPath}`;
  if (pathname === `${base}/login`) return true;
  if (pathname === `/api/${adminPath}/auth/login`) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const adminPath = getAdminPath();
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/internal/admin") ||
    pathname.startsWith("/api/internal/admin")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const pagePrefix = `/${adminPath}`;
  const apiPrefix = `/api/${adminPath}`;

  const isAdminPage =
    pathname === pagePrefix || pathname.startsWith(`${pagePrefix}/`);
  const isAdminApi =
    pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`);

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (isPublicAdminPath(pathname, adminPath)) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const session = await verifyAdminSessionToken(token);

    if (session && !isAdminApi) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = pagePrefix;
      return NextResponse.redirect(dashboardUrl);
    }

    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const session = await verifyAdminSessionToken(token);

  if (!session) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `${pagePrefix}/login`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
