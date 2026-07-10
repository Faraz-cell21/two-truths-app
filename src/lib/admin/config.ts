export const ADMIN_COOKIE_NAME = "ttal_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function getAdminPath(): string {
  const raw = (process.env.ADMIN_PATH || "x7k9m2p4").trim();

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const segments = new URL(raw).pathname.split("/").filter(Boolean);
      if (segments.at(-1) === "login") {
        return segments.at(-2) || "x7k9m2p4";
      }
      return segments[0] || "x7k9m2p4";
    } catch {
      return "x7k9m2p4";
    }
  }

  const cleaned = raw.replace(/^\/+|\/+$/g, "");
  return cleaned.split("/").filter(Boolean)[0] || "x7k9m2p4";
}

export function getAdminSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ADMIN_SESSION_SECRET is required in production.");
    }
    return "dev-only-admin-secret-change-me";
  }
  return secret;
}

export function getAdminSeedEmail(): string {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("ADMIN_EMAIL is required.");
  }
  return email;
}

export function getAdminSeedPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is required.");
  }
  return password;
}

export function getAdminPublicBasePath(): string {
  return `/${getAdminPath()}`;
}

export function getAdminLoginPath(): string {
  return `${getAdminPublicBasePath()}/login`;
}

export function getAdminDashboardPath(): string {
  return getAdminPublicBasePath();
}

export function getAdminApiBasePath(): string {
  return `/api/${getAdminPath()}`;
}
