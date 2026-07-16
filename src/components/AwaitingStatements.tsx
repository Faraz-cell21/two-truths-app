"use client";

import { useEffect, useState } from "react";
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
}

export default function AwaitingStatements({
  submitterName,
  submitterAvatarColor,
  submitterIndex = 0,
  currentRound,
  totalRounds,
}: AwaitingStatementsProps) {
  const [activeSlot, setActiveSlot] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveSlot((i) => (i + 1) % 3);
    }, 1600);
    return () => clearInterval(id);
  }, []);

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
