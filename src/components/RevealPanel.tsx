"use client";

import type { Vote, ScoreDelta } from "@/types/game";

/* ===================================================================
   RevealPanel — shows the round results after the lie is revealed.

   Highlights which statement was the lie, shows the vote breakdown
   (who voted for each statement), and displays score changes.
   =================================================================== */

interface RevealPanelProps {
  statements: [string, string, string];
  lieIndex: 0 | 1 | 2;
  scoreDeltas: ScoreDelta[];
  scores: Array<{ sessionId: string; displayName: string; score: number }>;
  currentPlayerSessionId: string;
  votes: Vote[];
  players: Array<{ sessionId: string; displayName: string }>;
}

export default function RevealPanel({
  statements,
  lieIndex,
  scoreDeltas,
  scores,
  currentPlayerSessionId,
  votes,
  players,
}: RevealPanelProps) {
  const winner = [...scores].sort((a, b) => b.score - a.score)[0];

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <header className="text-center space-y-2">
        <h2 className="font-serif text-xl font-semibold text-warm">
          The lie is revealed
        </h2>
        <hr className="polygraph-line" />
      </header>

      {/* ---- Statements with lie highlight ---- */}
      <div className="space-y-3">
        {statements.map((stmt, i) => {
          const isLie = i === lieIndex;
          const voteCount = votes.filter((v) => v.votedIndex === i).length;
          const voterNames = votes
            .filter((v) => v.votedIndex === i)
            .map((v) => players.find((p) => p.sessionId === v.sessionId)?.displayName ?? "Unknown");

          return (
            <div
              key={i}
              className={
                "interrogation-card border " +
                (isLie ? "border-lie bg-lie/5" : "border-border")
              }
            >
              <div className="flex items-start gap-3">
                {/* Badge */}
                <span
                  className={
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold " +
                    (isLie ? "bg-lie text-ink" : "bg-truth/20 text-truth")
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-warm leading-relaxed">{stmt}</p>

                  {isLie && (
                    <p className="text-sm font-semibold text-lie">
                      ← The lie
                    </p>
                  )}
                  {!isLie && (
                    <p className="text-sm font-semibold text-truth">
                      ← Truth
                    </p>
                  )}

                  {voteCount > 0 && (
                    <p className="text-xs text-muted">
                      {voteCount} {voteCount === 1 ? "detective" : "detectives"}{" "}
                      guessed this: {voterNames.join(", ")}
                    </p>
                  )}
                  {voteCount === 0 && (
                    <p className="text-xs text-muted/60">
                      No one guessed this statement.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Score changes ---- */}
      <div className="interrogation-card space-y-3">
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted">
          Score changes
        </h3>
        <div className="space-y-2">
          {scoreDeltas.map((d) => (
            <div
              key={d.sessionId}
              className={
                "flex items-center justify-between rounded-lg px-4 py-2 " +
                (d.sessionId === currentPlayerSessionId
                  ? "bg-truth/10 border border-truth/20"
                  : "")
              }
            >
              <span className="text-sm text-warm">
                {d.displayName}
                {d.sessionId === currentPlayerSessionId && (
                  <span className="ml-1 text-xs text-truth">(you)</span>
                )}
              </span>
              <span
                className={
                  "font-mono text-sm font-bold " +
                  (d.delta > 0 ? "text-truth" : "text-muted")
                }
              >
                {d.delta > 0 ? `+${d.delta}` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Current leader ---- */}
      {winner && (
        <p className="text-center text-sm text-muted">
          Current leader:{" "}
          <span className="font-semibold text-warm">
            {winner.displayName}
            {winner.sessionId === currentPlayerSessionId ? " (you!)" : ""}
          </span>{" "}
          with {winner.score} {winner.score === 1 ? "point" : "points"}
        </p>
      )}
    </div>
  );
}
