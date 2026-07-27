"use client";

import { useEffect, useState, useRef } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";

/* ===================================================================
   AwaitingStatements — waiting while someone writes their statements.
   =================================================================== */

interface AwaitingStatementsProps {
  submitterName: string;
  submitterAvatarColor?: string;
  submitterIndex?: number;
  currentRound: number;
  totalRounds: number;
  submitDeadline?: string | null;
  onTimeout?: () => void;
}

function secondsUntil(deadlineIso: string | null | undefined): number | null {
  if (!deadlineIso) return null;
  const ms = Date.parse(deadlineIso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 1000));
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AwaitingStatements({
  submitterName,
  submitterAvatarColor,
  submitterIndex = 0,
  currentRound,
  totalRounds,
  submitDeadline = null,
  onTimeout,
}: AwaitingStatementsProps) {
  const [activeSlot, setActiveSlot] = useState(0);
  const [timer, setTimer] = useState<number | null>(() =>
    secondsUntil(submitDeadline)
  );
  const timeoutFiredRef = useRef(false);
  const urgent = timer !== null && timer <= 20;

  useEffect(() => {
    const id = setInterval(() => {
      setActiveSlot((i) => (i + 1) % 3);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    timeoutFiredRef.current = false;
  }, [submitDeadline]);

  useEffect(() => {
    if (!submitDeadline) {
      setTimer(null);
      return;
    }

    const tick = () => {
      const remaining = secondsUntil(submitDeadline);
      setTimer(remaining);
      if (remaining === 0 && onTimeout && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        onTimeout();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [submitDeadline, onTimeout]);

  return (
    <div className="interrogation-card relative overflow-hidden space-y-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        aria-hidden="true"
        style={{
          background: urgent
            ? "radial-gradient(ellipse 75% 55% at 50% 0%, color-mix(in srgb, var(--theme-lie) 18%, transparent), transparent 70%)"
            : "radial-gradient(ellipse 75% 55% at 50% 0%, color-mix(in srgb, var(--theme-truth) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="relative space-y-5">
        <header className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
            Round {currentRound} of {totalRounds}
          </p>

          <div className="awaiting-avatar-pulse">
            <PlayerAvatar
              displayName={submitterName}
              avatarColor={submitterAvatarColor}
              index={submitterIndex}
              size="lg"
            />
          </div>

          <h2 className="font-serif text-xl font-semibold text-warm">
            {submitterName} is writing…
          </h2>
          <p className="max-w-xs text-sm text-muted">
            Two truths and a lie are on the way.
          </p>

          <div
            className={
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-base tabular-nums " +
              (urgent
                ? "border-lie/50 bg-lie/10 text-lie"
                : "border-border bg-field/60 text-warm")
            }
            aria-label={
              timer === null
                ? "Timer starting"
                : `${timer} seconds remaining`
            }
          >
            <span className="text-[0.65rem] uppercase tracking-widest text-muted">
              Time left
            </span>
            {timer === null ? "2:00" : formatTime(timer)}
          </div>
        </header>

        <hr className="polygraph-line !my-0" />

        {/* Visual placeholders for the three statements being drafted */}
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map((i) => {
            const active = activeSlot === i;
            return (
              <div
                key={i}
                className={
                  "rounded-xl border px-3.5 py-3 transition-all duration-500 " +
                  (active
                    ? "border-truth/40 bg-truth/8 scale-[1.01]"
                    : "border-border/60 bg-field/35")
                }
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                    Statement {i + 1}
                  </span>
                  {active && (
                    <span className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <i
                          key={d}
                          className="inline-block h-1 w-1 rounded-full bg-truth"
                          style={{
                            animation: "awaiting-dot 1.1s ease-in-out infinite",
                            animationDelay: `${d * 0.15}s`,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div
                    className={
                      "h-2 rounded-full " +
                      (active ? "awaiting-shimmer" : "bg-border/45")
                    }
                    style={{ width: active ? "88%" : `${52 + i * 14}%` }}
                  />
                  <div
                    className={
                      "h-2 rounded-full " +
                      (active
                        ? "awaiting-shimmer awaiting-shimmer-delay"
                        : "bg-border/30")
                    }
                    style={{ width: active ? "58%" : `${34 + i * 10}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
