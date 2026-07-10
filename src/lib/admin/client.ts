import { getAdminPublicBasePath } from "@/lib/admin/config";

function getAdminBasePathFromBrowser(): string {
  if (typeof window === "undefined") {
    return getAdminPublicBasePath();
  }

  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  return segment ? `/${segment}` : getAdminPublicBasePath();
}

export function getAdminApiBasePath(): string {
  const basePath = getAdminBasePathFromBrowser();
  return `/api${basePath}`;
}

export function getAdminDashboardPathFromBrowser(): string {
  return getAdminBasePathFromBrowser();
}

export function getAdminLoginUrlForBrowser(): string {
  if (typeof window === "undefined") {
    return `${getAdminPublicBasePath()}/login`;
  }

  return `${window.location.origin}${getAdminBasePathFromBrowser()}/login`;
}

export function getAdminDashboardUrlForBrowser(): string {
  if (typeof window === "undefined") {
    return getAdminPublicBasePath();
  }

  return `${window.location.origin}${getAdminBasePathFromBrowser()}`;
}
