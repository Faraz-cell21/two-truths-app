"use client";

import { useState, useEffect, useRef } from "react";
import type { Vote } from "@/types/game";
import PlayerAvatar from "@/components/PlayerAvatar";

/* ===================================================================
   VotePanel — pick which statement is the lie.
   =================================================================== */

export interface VoteResult {
  sessionId: string;
  displayName: string;
  votedIndex: 0 | 1 | 2;
  isCorrect: boolean;
}

interface VotePanelProps {
  statements: [string, string, string];
  submittedBy: string;
  submittedByAvatarColor?: string;
  submittedByIndex?: number;
  votes: Vote[];
  playerCount: number;
  onVote: (votedIndex: 0 | 1 | 2) => Promise<void>;
  hasVoted: boolean;
  votedIndex: 0 | 1 | 2 | null;
  lieIndex?: 0 | 1 | 2 | null;
  voteResults?: VoteResult[];
  isSubmitter?: boolean;
  showContinue?: boolean;
  onContinue?: () => void;
  /** Fired once when the 30s vote timer reaches 0 (triggers reveal). */
  onTimeout?: () => void;
}

const TIMER_SECONDS = 30;
const CIRCLE_RADIUS = 34;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export default function VotePanel({
  statements,
  submittedBy,
  submittedByAvatarColor,
  submittedByIndex = 0,
  votes,
  playerCount,
  onVote,
  hasVoted,
  votedIndex,
  lieIndex = null,
  voteResults = [],
  isSubmitter = false,
  showContinue = false,
  onContinue,
  onTimeout,
}: VotePanelProps) {
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [voting, setVoting] = useState(false);
  const [pressed, setPressed] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutFiredRef = useRef(false);

  const showResults = lieIndex !== null && voteResults.length > 0;
  const urgent = !hasVoted && !isSubmitter && timer <= 5;
  const timeExpired = timer === 0 && !showResults;

  useEffect(() => {
    // Only voters who already cast stop the clock. Submitters (and anyone
    // still deciding) must keep counting down so timeout can force-reveal.
    if (hasVoted) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasVoted]);

  useEffect(() => {
    if (timer !== 0 || !onTimeout || timeoutFiredRef.current) return;
    timeoutFiredRef.current = true;
    onTimeout();
  }, [timer, onTimeout]);

  const handleVote = async (index: 0 | 1 | 2) => {
    if (hasVoted || voting || isSubmitter || timeExpired) return;
    setPressed(index);
    setVoting(true);
    try {
      await onVote(index);
    } catch {
      // parent handles error
    } finally {
      setVoting(false);
    }
  };

  const eligibleVoters = Math.max(playerCount - 1, 0);
  const votesCast = votes.length;

  const timerPct = timer / TIMER_SECONDS;
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - timerPct);
  const timerColor =
    timer <= 5 ? "var(--color-lie)" : timer <= 15 ? "#e8a850" : "var(--color-truth)";

  // Submitter waits while others vote — don't show the accusation UI yet.
  if (isSubmitter && !showResults) {
    return (
      <div className="interrogation-card relative overflow-hidden space-y-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 75% 55% at 50% 0%, color-mix(in srgb, var(--theme-truth) 18%, transparent), transparent 70%)",
          }}
        />

        <div className="relative space-y-5 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="awaiting-avatar-pulse">
              <PlayerAvatar
                displayName={submittedBy}
                avatarColor={submittedByAvatarColor}
                index={submittedByIndex}
                size="lg"
              />
            </div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              Your statements are in
            </p>
            <h2 className="font-serif text-xl font-semibold text-warm">
              Waiting for votes…
            </h2>
            <p className="max-w-xs text-sm text-muted">
              {timeExpired
                ? "Time's up — revealing results…"
                : "The others are picking which statement is the lie."}
            </p>
          </div>

          <hr className="polygraph-line !my-0" />

          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.max(eligibleVoters, 1) }).map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-2 w-8 rounded-full transition-all duration-500 " +
                    (i < votesCast ? "bg-truth" : "bg-border/80")
                  }
                />
              ))}
            </div>
            <p className="font-mono text-xs tabular-nums tracking-wide text-muted">
              {votesCast} of {eligibleVoters}{" "}
              {eligibleVoters === 1 ? "vote" : "votes"} in
            </p>
          </div>

          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-truth/70"
                style={{
                  animation: "awaiting-dot 1.1s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const headline = showResults
    ? isSubmitter
      ? "Results"
      : hasVoted
        ? voteResults.find((r) => r.votedIndex === votedIndex)?.isCorrect
          ? "Correct!"
          : "Wrong guess"
        : "Which one is the lie?"
    : "Which one is the lie?";

  const getStatementStyle = (index: number) => {
    if (!showResults || lieIndex === null) {
      const isSelected = hasVoted && votedIndex === index;
      if (isSelected) return "vote-option-selected border-lie ring-2 ring-lie/60";
      if (hasVoted || isSubmitter || timeExpired) return "opacity-65 cursor-default";
      return "vote-option-interactive cursor-pointer";
    }

    const isLie = index === lieIndex;
    const isMyWrongPick =
      hasVoted && votedIndex === index && votedIndex !== lieIndex;

    if (isLie) return "border-truth ring-2 ring-truth/60 bg-truth/8";
    if (isMyWrongPick) return "border-lie ring-2 ring-lie/60 bg-lie/8";
    return "opacity-55 cursor-default";
  };

  const getBadgeStyle = (index: number) => {
    if (!showResults || lieIndex === null) {
      if (hasVoted && votedIndex === index) return "bg-lie text-ink shadow-sm";
      return "bg-truth/15 text-truth border border-truth/25";
    }

    if (index === lieIndex) return "bg-truth text-ink shadow-sm";
    if (hasVoted && votedIndex === index && votedIndex !== lieIndex) {
      return "bg-lie text-ink shadow-sm";
    }
    return "bg-border/70 text-muted";
  };

  const getAccent = (index: number) => {
    if (showResults && lieIndex === index) return "bg-truth";
    if (showResults && hasVoted && votedIndex === index && votedIndex !== lieIndex) {
      return "bg-lie";
    }
    if (hasVoted && votedIndex === index) return "bg-lie";
    return "bg-truth/50";
  };

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/40 px-4 py-5 text-center backdrop-blur-sm sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          aria-hidden="true"
          style={{
            background: urgent
              ? "radial-gradient(ellipse 80% 70% at 50% 0%, color-mix(in srgb, var(--theme-lie) 24%, transparent), transparent 68%)"
              : "radial-gradient(ellipse 80% 70% at 50% 0%, color-mix(in srgb, var(--theme-truth) 18%, transparent), transparent 68%)",
          }}
        />

        <div className="relative space-y-3.5">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-field/50 px-3 py-1.5">
            <PlayerAvatar
              displayName={submittedBy}
              avatarColor={submittedByAvatarColor}
              index={submittedByIndex}
              size="sm"
            />
            <span className="text-sm text-muted">
              From{" "}
              <span className="font-semibold text-warm">{submittedBy}</span>
            </span>
          </div>

          <h2 className="font-serif text-2xl font-semibold tracking-tight text-warm">
            {headline}
          </h2>

          {!hasVoted && !isSubmitter && (
            <div
              className={
                "relative mx-auto flex h-[5.75rem] w-[5.75rem] items-center justify-center " +
                (urgent ? "vote-timer-urgent" : "")
              }
            >
              <div
                className="absolute inset-1 rounded-full opacity-30"
                style={{
                  boxShadow: `0 0 28px 2px ${timerColor}`,
                }}
                aria-hidden="true"
              />
              <svg
                className="relative h-full w-full -rotate-90"
                viewBox="0 0 80 80"
                aria-label={`${timer} seconds remaining`}
              >
                <circle
                  cx="40"
                  cy="40"
                  r={CIRCLE_RADIUS}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="5"
                  opacity="0.45"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={CIRCLE_RADIUS}
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={CIRCLE_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    transition: "stroke-dashoffset 1s linear, stroke 0.4s",
                  }}
                />
              </svg>
              <span
                className="absolute font-mono text-2xl font-bold tabular-nums"
                style={{ color: timerColor }}
              >
                {timer}
              </span>
            </div>
          )}

          {/* Compact vote seats */}
          {eligibleVoters > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: eligibleVoters }).map((_, i) => (
                  <span
                    key={i}
                    className={
                      "h-2 w-6 rounded-full transition-all duration-500 " +
                      (i < votesCast
                        ? "bg-truth scale-100"
                        : "bg-border/80 scale-95")
                    }
                  />
                ))}
              </div>
              <p className="font-mono text-[0.7rem] tabular-nums tracking-wide text-muted">
                {votesCast}/{eligibleVoters} votes
              </p>
            </div>
          )}
        </div>
      </header>

      <hr className="polygraph-line !my-1" />

      <div className="space-y-3 stagger-children">
        {statements.map((stmt, i) => {
          const isSelected = hasVoted && votedIndex === i;
          const votersForStatement = voteResults.filter(
            (r) => r.votedIndex === i
          );
          const isLie = showResults && lieIndex === i;
          const isMyWrongPick =
            showResults &&
            hasVoted &&
            votedIndex === i &&
            votedIndex !== lieIndex;
          const liveVotes = votes.filter((v) => v.votedIndex === i).length;
          const justPressed = pressed === i;

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleVote(i as 0 | 1 | 2)}
              disabled={hasVoted || voting || isSubmitter || timeExpired}
              className={
                "vote-option interrogation-card relative w-full overflow-hidden text-left " +
                getStatementStyle(i) +
                (justPressed ? " vote-option-press" : "")
              }
            >
              <span
                className={
                  "absolute inset-y-0 left-0 w-1 " + getAccent(i)
                }
                aria-hidden="true"
              />

              <div className="flex items-start gap-4 pl-1">
                <span
                  className={
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold transition-transform " +
                    getBadgeStyle(i)
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                  <p className="text-[0.98rem] leading-relaxed text-warm sm:text-base">
                    {stmt}
                  </p>

                  {showResults && isLie && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-truth">
                      The lie
                    </p>
                  )}
                  {showResults && isMyWrongPick && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-lie">
                      Your guess
                    </p>
                  )}
                  {isSelected && !showResults && (
                    <p className="text-xs font-medium text-lie">Your vote</p>
                  )}

                  {votersForStatement.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {votersForStatement.map((r) => (
                        <span
                          key={r.sessionId}
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            (r.isCorrect
                              ? "bg-truth/15 text-truth"
                              : "bg-lie/15 text-lie")
                          }
                        >
                          {r.displayName}
                          {r.isCorrect ? " ✓" : " ✗"}
                        </span>
                      ))}
                    </div>
                  )}

                  {!showResults && liveVotes > 0 && (
                    <p className="text-xs text-muted">
                      {liveVotes} {liveVotes === 1 ? "vote" : "votes"}
                    </p>
                  )}
                </div>

                {isSelected && !showResults && (
                  <span className="text-lg font-bold text-lie" aria-hidden>
                    &#10003;
                  </span>
                )}
                {showResults && isLie && (
                  <span className="text-lg font-bold text-truth" aria-hidden>
                    &#10003;
                  </span>
                )}
                {showResults && isMyWrongPick && (
                  <span className="text-lg font-bold text-lie" aria-hidden>
                    &#10007;
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showContinue && onContinue ? (
        <div className="text-center">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-truth px-8 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted" role="status">
          {hasVoted
            ? showResults
              ? "Waiting for all votes…"
              : "Vote locked in. Waiting for others…"
            : isSubmitter
              ? votesCast === 0
                ? "No votes yet"
                : "Votes are coming in…"
              : timeExpired
                ? "Time's up — no vote counts as wrong"
                : "Tap the statement you think is the lie"}
        </p>
      )}
    </div>
  );
}
