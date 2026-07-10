import { getAdminSessionSecret } from "@/lib/admin/config";

export interface AdminSessionPayload {
  sub: string;
  email: string;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Uint8Array.from(bytes);
}

async function signPayload(payload: string): Promise<string> {
  const secret = getAdminSessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = getAdminSessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature) as BufferSource,
    new TextEncoder().encode(payload)
  );
}

export async function createAdminSessionToken(
  payload: Omit<AdminSessionPayload, "exp"> & { exp?: number },
  ttlMs: number
): Promise<string> {
  const body: AdminSessionPayload = {
    ...payload,
    exp: payload.exp ?? Date.now() + ttlMs,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(body))
  );
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSessionToken(
  token: string | undefined | null
): Promise<AdminSessionPayload | null> {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const valid = await verifySignature(encodedPayload, signature);
  if (!valid) return null;

  try {
    const json = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const payload = JSON.parse(json) as AdminSessionPayload;
    if (!payload.sub || !payload.email || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
