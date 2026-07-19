/** Voting window after statements are submitted. */
export const VOTE_DURATION_MS = 30 * 1000;

/** Optional submit-window used by unfinished submit-deadline helpers. */
export const SUBMIT_DURATION_MS = 90 * 1000;

/**
 * After a playing room drops below 2 connected players, wait this long
 * before force-ending — covers refresh / brief network drops.
 */
export const RECONNECT_GRACE_MS = 20 * 1000;

export function computeVoteDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + VOTE_DURATION_MS);
}

export function computeSubmitDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + SUBMIT_DURATION_MS);
}

/** Resolve the vote deadline, falling back for legacy rounds without the field. */
export function resolveVoteDeadline(round: {
  voteDeadline?: Date | string | null;
  createdAt: Date | string;
}): Date {
  if (round.voteDeadline) {
    const d =
      typeof round.voteDeadline === "string"
        ? new Date(round.voteDeadline)
        : round.voteDeadline;
    if (!Number.isNaN(d.getTime())) return d;
  }
  const created =
    typeof round.createdAt === "string"
      ? new Date(round.createdAt)
      : round.createdAt;
  return new Date(created.getTime() + VOTE_DURATION_MS);
}

export function isVoteDeadlinePassed(
  round: {
    voteDeadline?: Date | string | null;
    createdAt: Date | string;
  },
  now: Date = new Date()
): boolean {
  return now.getTime() >= resolveVoteDeadline(round).getTime();
}
