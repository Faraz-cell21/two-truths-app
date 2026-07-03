"use client";

import { useState, useEffect, useRef } from "react";
import type { Vote } from "@/types/game";

/* ===================================================================
   VotePanel — non-submitter players see 3 statements and pick which
   one they believe is the lie.

   Feature: 30-second countdown timer (visual guidance only — the
   server doesn't enforce a hard cutoff in MVP).
   =================================================================== */

interface VotePanelProps {
  statements: [string, string, string];
  submittedBy: string;
  votes: Vote[];
  playerCount: number; // used to compute "X of Y votes"
  onVote: (votedIndex: 0 | 1 | 2) => Promise<void>;
  hasVoted: boolean;
  votedIndex: 0 | 1 | 2 | null;
}

const TIMER_SECONDS = 30;

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer
  useEffect(() => {
    if (hasVoted) return;
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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
  const timerPct = (timer / TIMER_SECONDS) * 100;

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <header className="text-center space-y-2">
        <h2 className="font-serif text-xl font-semibold text-warm">
          Which one is the lie?
        </h2>
        <p className="text-sm text-muted">
          Statement submitted by{" "}
          <span className="font-semibold text-warm">{submittedBy}</span>
        </p>
      </header>

      {/* ---- Timer bar ---- */}
      {!hasVoted && (
        <div className="space-y-1">
          <div className="h-1 w-full rounded-full bg-card overflow-hidden">
            <div
              className={
                "h-full rounded-full transition-all duration-1000 " +
                (timer <= 5 ? "bg-lie" : timer <= 15 ? "bg-lie/60" : "bg-truth")
              }
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <p className="text-xs font-mono text-muted text-right">
            {timer}s remaining
          </p>
        </div>
      )}

      {/* ---- Statement cards ---- */}
      <div className="space-y-3">
        {statements.map((stmt, i) => {
          const isSelected = hasVoted && votedIndex === i;
          const isMostVoted =
            votes.filter((v) => v.votedIndex === i).length > 0;

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
                      : isMostVoted
                        ? "bg-border text-warm"
                        : "bg-card text-muted border border-border")
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-warm leading-relaxed">{stmt}</p>
                  {isMostVoted && (
                    <p className="text-xs text-muted">
                      {votes.filter((v) => v.votedIndex === i).length}{" "}
                      {votes.filter((v) => v.votedIndex === i).length === 1
                        ? "vote"
                        : "votes"}
                    </p>
                  )}
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <span className="text-lie font-bold text-lg" aria-hidden>
                    ✓
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
