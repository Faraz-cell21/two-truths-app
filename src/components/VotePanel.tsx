"use client";

import { useState, useEffect, useRef } from "react";
import type { Vote } from "@/types/game";

/* ===================================================================
   VotePanel — non-submitter players see 3 statements and pick which
   one they believe is the lie.

   Features a circular SVG countdown timer with urgency color shifts:
     green (30-16s) → yellow (15-6s) → red (5-0s).

   After voting (or when results are revealed), options lock and
   correct/wrong answers are highlighted in green/red.
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
  votes: Vote[];
  playerCount: number;
  onVote: (votedIndex: 0 | 1 | 2) => Promise<void>;
  hasVoted: boolean;
  votedIndex: 0 | 1 | 2 | null;
  /** When set, show green for the lie and red for wrong picks. */
  lieIndex?: 0 | 1 | 2 | null;
  /** Per-player vote results to display after votes are cast. */
  voteResults?: VoteResult[];
  /** Whether the current player is the submitter (watching votes come in). */
  isSubmitter?: boolean;
  /** Show a Continue button once all votes are in and results are ready. */
  showContinue?: boolean;
  onContinue?: () => void;
}

const TIMER_SECONDS = 30;
const CIRCLE_RADIUS = 32;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export default function VotePanel({
  statements,
  submittedBy,
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
}: VotePanelProps) {
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [voting, setVoting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showResults = lieIndex !== null && voteResults.length > 0;

  // Countdown
  useEffect(() => {
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

  const handleVote = async (index: 0 | 1 | 2) => {
    if (hasVoted || voting) return;
    setVoting(true);
    try {
      await onVote(index);
    } catch {
      // Error handled by parent
    } finally {
      setVoting(false);
    }
  };

  const eligibleVoters = playerCount - 1;
  const votesCast = votes.length;

  // Timer calculations
  const timerPct = timer / TIMER_SECONDS;
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - timerPct);
  const timerColor =
    timer <= 5 ? "var(--color-lie)" : timer <= 15 ? "#e8a850" : "var(--color-truth)";

  const getStatementStyle = (index: number) => {
    if (!showResults || lieIndex === null) {
      const isSelected = hasVoted && votedIndex === index;
      return isSelected
        ? "ring-2 ring-lie border-lie"
        : hasVoted
          ? "opacity-70 cursor-default"
          : "cursor-pointer hover:border-muted hover:bg-card/80";
    }

    const isLie = index === lieIndex;
    const isMyWrongPick =
      hasVoted && votedIndex === index && votedIndex !== lieIndex;

    if (isLie) {
      return "ring-2 ring-truth border-truth bg-truth/5";
    }
    if (isMyWrongPick) {
      return "ring-2 ring-lie border-lie bg-lie/5";
    }
    return "opacity-70 cursor-default";
  };

  const getBadgeStyle = (index: number) => {
    if (!showResults || lieIndex === null) {
      const isSelected = hasVoted && votedIndex === index;
      const voteCount = votes.filter((v) => v.votedIndex === index).length;
      if (isSelected) return "bg-lie text-ink";
      if (voteCount > 0) return "bg-border text-warm";
      return "bg-card text-muted border border-border";
    }

    const isLie = index === lieIndex;
    const isMyWrongPick =
      hasVoted && votedIndex === index && votedIndex !== lieIndex;

    if (isLie) return "bg-truth text-ink";
    if (isMyWrongPick) return "bg-lie text-ink";
    return "bg-card text-muted border border-border";
  };

  return (
    <div className="space-y-6">
      {/* ---- Header with circular timer ---- */}
      <header className="text-center space-y-3">
        <h2 className="font-serif text-xl font-semibold text-warm">
          {showResults
            ? isSubmitter
              ? "The verdict is in"
              : hasVoted
                ? voteResults.find((r) => r.votedIndex === votedIndex)?.isCorrect
                  ? "Correct!"
                  : "Wrong guess"
                : "Which one is the lie?"
            : "Which one is the lie?"}
        </h2>
        <p className="text-sm text-muted">
          Statement submitted by{" "}
          <span className="font-semibold text-warm">{submittedBy}</span>
        </p>

        {/* Circular timer */}
        {!hasVoted && !isSubmitter && (
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <svg
              className="h-full w-full -rotate-90"
              viewBox="0 0 72 72"
              aria-label={`${timer} seconds remaining`}
            >
              {/* Background ring */}
              <circle
                cx="36"
                cy="36"
                r={CIRCLE_RADIUS}
                fill="none"
                stroke="var(--color-card)"
                strokeWidth="4"
              />
              {/* Countdown ring */}
              <circle
                cx="36"
                cy="36"
                r={CIRCLE_RADIUS}
                fill="none"
                stroke={timerColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={CIRCLE_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
              />
            </svg>
            <span
              className="absolute font-mono text-lg font-bold"
              style={{ color: timerColor }}
            >
              {timer}
            </span>
          </div>
        )}
      </header>

      {/* ---- Statement cards ---- */}
      <div className="space-y-3 stagger-children">
        {statements.map((stmt, i) => {
          const isSelected = hasVoted && votedIndex === i;
          const votersForStatement = voteResults.filter((r) => r.votedIndex === i);
          const isLie = showResults && lieIndex === i;
          const isWrongPick =
            showResults && hasVoted && votedIndex === i && votedIndex !== lieIndex;

          return (
            <button
              key={i}
              onClick={() => handleVote(i as 0 | 1 | 2)}
              disabled={hasVoted || voting || isSubmitter}
              className={"interrogation-card w-full text-left transition-all " + getStatementStyle(i)}
            >
              <div className="flex items-start gap-4">
                {/* Statement number badge */}
                <span
                  className={
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold " +
                    getBadgeStyle(i)
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-warm leading-relaxed">{stmt}</p>

                  {showResults && isLie && (
                    <p className="text-xs font-medium text-truth">← The lie</p>
                  )}
                  {showResults && isWrongPick && (
                    <p className="text-xs font-medium text-lie">← Your guess</p>
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

                  {!showResults && votes.filter((v) => v.votedIndex === i).length > 0 && (
                    <p className="text-xs text-muted">
                      {votes.filter((v) => v.votedIndex === i).length}{" "}
                      {votes.filter((v) => v.votedIndex === i).length === 1 ? "vote" : "votes"}
                    </p>
                  )}
                </div>

                {/* Selected checkmark */}
                {isSelected && !showResults && (
                  <span className="text-lie font-bold text-lg" aria-hidden>
                    &#10003;
                  </span>
                )}
                {showResults && isLie && (
                  <span className="text-truth font-bold text-lg" aria-hidden>
                    &#10003;
                  </span>
                )}
                {showResults && isWrongPick && (
                  <span className="text-lie font-bold text-lg" aria-hidden>
                    &#10007;
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- Vote progress / Continue ---- */}
      {showContinue && onContinue ? (
        <div className="text-center space-y-3">
          <button
            onClick={onContinue}
            className="rounded-lg bg-truth px-8 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          {hasVoted
            ? showResults
              ? "Waiting for all votes…"
              : "Your vote has been recorded. Waiting for others…"
            : isSubmitter
              ? `${votesCast} of ${eligibleVoters} votes cast`
              : `${votesCast} of ${eligibleVoters} votes cast`}
        </p>
      )}

      {/* ---- Time's up ---- */}
      {timer === 0 && !hasVoted && !isSubmitter && (
        <p className="text-center text-sm text-lie animate-pulse">
          Time&apos;s up! Please cast your vote.
        </p>
      )}
    </div>
  );
}
