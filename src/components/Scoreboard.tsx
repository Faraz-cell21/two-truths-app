"use client";

import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import type { Player } from "@/types/game";
import { useTheme } from "@/components/ThemeProvider";

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
  gameEndReason?: string;
}

const AUTO_ADVANCE_SECONDS = 5;

/** Brand confetti — vivid cobalt / hot magenta. */
const CONFETTI_COLORS = {
  dark: ["#4da3ff", "#ff4f9a", "#ffffff", "#9ec5ff", "#ff8fbf"],
  light: ["#0057e7", "#d6006e", "#000000", "#2f6fed", "#ff4f9a"],
} as const;

function getConfettiColors(theme: "dark" | "light") {
  return [...CONFETTI_COLORS[theme]];
}

export default function Scoreboard({
  players,
  currentRound,
  totalRounds,
  isGameOver,
  currentPlayerSessionId,
  onContinue,
  onPlayAgain,
  gameEndReason,
}: ScoreboardProps) {
  const { theme } = useTheme();
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS);

  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const isTie = ranked.filter((p) => p.score === topScore).length > 1;

  // Auto-advance for between-round scoreboard
  useEffect(() => {
    if (isGameOver) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGameOver]);

  useEffect(() => {
    if (isGameOver || countdown > 0) return;
    onContinue();
  }, [countdown, isGameOver, onContinue]);

  // Confetti celebration when the current player wins
  const confettiFiredRef = useRef(false);
  const isCurrentPlayerWinner =
    isGameOver && !isTie && topScore > 0 && ranked[0]?.sessionId === currentPlayerSessionId;

  useEffect(() => {
    if (!isCurrentPlayerWinner || confettiFiredRef.current) return;
    confettiFiredRef.current = true;

    const colors = getConfettiColors(theme);
    const duration = 3000;
    const end = Date.now() + duration;

    // Fire confetti from both sides in bursts
    const frame = () => {
      const now = Date.now();
      const remaining = end - now;

      if (remaining <= 0) return;

      // Confetti from left side
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
      });

      // Confetti from right side
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
      });

      requestAnimationFrame(frame);
    };

    // Fire a stronger initial burst from both sides
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.5 },
      colors,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.5 },
      colors,
    });

    requestAnimationFrame(frame);
  }, [isCurrentPlayerWinner, theme]);

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <header className="text-center space-y-2">
        <h2 className="font-serif text-2xl font-bold text-warm">
          {isGameOver ? "Case closed" : "Standings"}
        </h2>
        <hr className="polygraph-line" />

        {isGameOver ? (
          <div className="space-y-2">
            {gameEndReason === "not-enough-players" && (
              <p className="text-sm text-lie font-medium">
                Game ended: not enough players remaining.
              </p>
            )}
            <p className="text-muted">
              {isTie
                ? "It's a tie! The detectives are evenly matched."
                : `${ranked[0]?.displayName} wins the case!`}
            </p>
          </div>
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
          const isLeader = player.score === topScore && player.score > 0;

          return (
            <div
              key={player.sessionId}
              className={
                "interrogation-card flex items-center gap-4 " +
                (isSelf ? "ring-1 ring-truth/40" : "") +
                (isLeader && isGameOver && !isTie
                  ? " border-truth/40 animate-pulse-glow"
                  : "")
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
                  {isGameOver && !isTie && isLeader && (
                    <span className="mr-1.5" aria-hidden>
                      &#127942;
                    </span>
                  )}
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
