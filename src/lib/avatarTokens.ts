/** Distinct seat colors for up to 5 players in a room. */
export const AVATAR_COLORS = [
  "#4da3ff", // cobalt
  "#ff4f9a", // magenta
  "#fbbf24", // gold
  "#22d3ee", // cyan
  "#c084fc", // violet
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** Dark ink on bright tokens for readable initials. */
export const AVATAR_INK = "#070b16";

export function avatarColorAt(index: number): AvatarColor {
  return AVATAR_COLORS[((index % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
}

/** Prefer stored color; fall back to seat index / session hash for legacy rooms. */
export function resolveAvatarColor(
  avatarColor: string | undefined | null,
  fallbackIndex: number
): string {
  if (avatarColor && AVATAR_COLORS.includes(avatarColor as AvatarColor)) {
    return avatarColor;
  }
  if (avatarColor && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    return avatarColor;
  }
  return avatarColorAt(fallbackIndex);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

/** First unused palette color given colors already taken in the room. */
export function nextUniqueAvatarColor(used: Iterable<string | undefined | null>): AvatarColor {
  const taken = new Set(
    [...used].filter((c): c is string => typeof c === "string" && c.length > 0)
  );
  return AVATAR_COLORS.find((c) => !taken.has(c)) ?? avatarColorAt(taken.size);
}
