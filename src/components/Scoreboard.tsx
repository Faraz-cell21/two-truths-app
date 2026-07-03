"use client";

import { useState, useEffect } from "react";
import type { Player } from "@/types/game";

/* ===================================================================
   Scoreboard — ranked player standings shown between rounds and at
   game end. Auto-advances after a few seconds (between rounds) or
   offers a "Play Again" action (game over).
   =================================================================== */

interface ScoreboardProps {
  players: Player[];
  currentRound: number;
  totalRounds: number;
  isGameOver: boolean;
  currentPlayerSessionId: string;
  onContinue: () => void;
  onPlayAgain: () => void;
}

const AUTO_ADVANCE_SECONDS = 5;

export default function Scoreboard({
  players,
  currentRound,
  totalRounds,
  isGameOver,
  currentPlayerSessionId,
  onContinue,
  onPlayAgain,
}: ScoreboardProps) {
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS);

  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const isTie = ranked.filter((p) => p.score === topScore).length > 1;

  // Auto-advance for between-round scoreboard
  useEffect(() => {
    if (isGameOver) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onContinue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isGameOver, onContinue]);

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <header className="text-center space-y-2">
        <h2 className="font-serif text-2xl font-bold text-warm">
          {isGameOver ? "Case closed" : "Standings"}
        </h2>
        <hr className="polygraph-line" />

        {isGameOver ? (
          <p className="text-muted">
            {isTie
              ? "It's a tie! The detectives are evenly matched."
              : `${ranked[0]?.displayName} wins the case!`}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Round {currentRound - 1} of {totalRounds} complete
            {" · "}
            Next round in {countdown}s
          </p>
        )}
      </header>

      {/* ---- Rankings ---- */}
      <div className="space-y-2">
        {ranked.map((player, rank) => {
          const isSelf = player.sessionId === currentPlayerSessionId;
          const isLeader = rank === 0 && player.score > 0;

          return (
            <div
              key={player.sessionId}
              className={
                "interrogation-card flex items-center gap-4 " +
                (isSelf ? "ring-1 ring-truth/40" : "") +
                (isLeader && isGameOver ? " border-truth/30" : "")
              }
            >
              {/* Rank */}
              <span
                className={
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold " +
                  (rank === 0 && !isTie
                    ? "bg-truth text-ink"
                    : rank === 0 && isTie
                      ? "bg-truth/20 text-truth"
                      : rank === 1
                        ? "bg-border text-warm"
                        : "bg-card text-muted border border-border")
                }
              >
                {rank + 1}
              </span>

              {/* Name */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-warm">
                  {player.displayName}
                  {isSelf && (
                    <span className="ml-2 text-xs text-truth">(you)</span>
                  )}
                </p>
              </div>

              {/* Score */}
              <span
                className={
                  "font-mono text-xl font-bold " +
                  (player.score > 0 ? "text-truth" : "text-muted")
                }
              >
                {player.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* ---- Actions ---- */}
      {isGameOver ? (
        <button
          onClick={onPlayAgain}
          className="w-full rounded-lg bg-truth py-3 font-semibold text-ink transition-opacity hover:opacity-90"
        >
          Play again
        </button>
      ) : (
        <button
          onClick={onContinue}
          className="w-full rounded-lg border border-border py-2 font-medium text-muted transition-colors hover:border-muted hover:text-warm"
        >
          Continue now
        </button>
      )}
    </div>
  );
}
