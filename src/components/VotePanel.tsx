"use client";

import { useState, useEffect, useRef } from "react";
import type { Vote } from "@/types/game";

/* ===================================================================
   VotePanel — non-submitter players see 3 statements and pick which
   one they believe is the lie.

   Features a circular SVG countdown timer with urgency color shifts:
     green (30-16s) → yellow (15-6s) → red (5-0s).
   =================================================================== */

interface VotePanelProps {
  statements: [string, string, string];
  submittedBy: string;
  votes: Vote[];
  playerCount: number;
  onVote: (votedIndex: 0 | 1 | 2) => Promise<void>;
  hasVoted: boolean;
  votedIndex: 0 | 1 | 2 | null;
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
}: VotePanelProps) {
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [voting, setVoting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  return (
    <div className="space-y-6">
      {/* ---- Header with circular timer ---- */}
      <header className="text-center space-y-3">
        <h2 className="font-serif text-xl font-semibold text-warm">
          Which one is the lie?
        </h2>
        <p className="text-sm text-muted">
          Statement submitted by{" "}
          <span className="font-semibold text-warm">{submittedBy}</span>
        </p>

        {/* Circular timer */}
        {!hasVoted && (
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
          const voteCount = votes.filter((v) => v.votedIndex === i).length;

          return (
            <button
              key={i}
              onClick={() => handleVote(i as 0 | 1 | 2)}
              disabled={hasVoted || voting}
              className={
                "interrogation-card w-full text-left transition-all " +
                (isSelected
                  ? "ring-2 ring-lie border-lie"
                  : hasVoted
                    ? "opacity-70 cursor-default"
                    : "cursor-pointer hover:border-muted hover:bg-card/80")
              }
            >
              <div className="flex items-start gap-4">
                {/* Statement number badge */}
                <span
                  className={
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold " +
                    (isSelected
                      ? "bg-lie text-ink"
                      : voteCount > 0
                        ? "bg-border text-warm"
                        : "bg-card text-muted border border-border")
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-warm leading-relaxed">{stmt}</p>
                  {voteCount > 0 && (
                    <p className="text-xs text-muted">
                      {voteCount}{" "}
                      {voteCount === 1 ? "vote" : "votes"}
                    </p>
                  )}
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <span className="text-lie font-bold text-lg" aria-hidden>
                    &#10003;
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- Vote progress ---- */}
      <p className="text-center text-sm text-muted">
        {hasVoted
          ? "Your vote has been recorded. Waiting for others…"
          : `${votesCast} of ${eligibleVoters} votes cast`}
      </p>

      {/* ---- Time's up ---- */}
      {timer === 0 && !hasVoted && (
        <p className="text-center text-sm text-lie animate-pulse">
          Time&apos;s up! Please cast your vote.
        </p>
      )}
    </div>
  );
}
