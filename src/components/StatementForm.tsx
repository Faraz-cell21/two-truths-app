"use client";

import { useState } from "react";

/* ===================================================================
   StatementForm — write 3 statements and mark the lie.
   =================================================================== */

interface StatementFormProps {
  onSubmit: (
    statements: [string, string, string],
    lieIndex: 0 | 1 | 2
  ) => Promise<void>;
  loading: boolean;
}

const MAX_LEN = 200;

export default function StatementForm({ onSubmit, loading }: StatementFormProps) {
  const [statements, setStatements] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [lieIndex, setLieIndex] = useState<0 | 1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    !loading &&
    !submitted &&
    statements.every((s) => s.trim().length > 0) &&
    lieIndex !== null;

  const handleChange = (i: number, value: string) => {
    if (value.length <= MAX_LEN) {
      const next = [...statements] as [string, string, string];
      next[i] = value;
      setStatements(next);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || lieIndex === null) return;
    setError(null);
    try {
      await onSubmit(
        statements.map((s) => s.trim()) as [string, string, string],
        lieIndex
      );
      setSubmitted(true);
    } catch {
      setError("Failed to submit. Try again.");
    }
  };

  if (submitted) {
    return (
      <div className="interrogation-card space-y-3 text-center">
        <p className="font-serif text-lg font-semibold text-warm">
          Statements submitted
        </p>
        <hr className="polygraph-line !my-2" />
        <p className="text-sm text-muted">Waiting for everyone to vote…</p>
        <div className="flex justify-center gap-1.5 pt-1" aria-hidden="true">
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
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 text-center">
        <h2 className="font-serif text-xl font-semibold text-warm">
          Your turn
        </h2>
        <p className="text-sm text-muted">
          Write two truths and one lie. Mark the lie.
        </p>
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => {
            const filled = statements[i].trim().length > 0;
            return (
              <span
                key={i}
                className={
                  "h-1.5 w-8 rounded-full transition-colors duration-300 " +
                  (filled
                    ? lieIndex === i
                      ? "bg-lie"
                      : "bg-truth"
                    : "bg-border")
                }
              />
            );
          })}
        </div>
        <hr className="polygraph-line !my-1" />
      </header>

      <div className="space-y-4">
        {statements.map((stmt, i) => {
          const isLie = lieIndex === i;
          return (
            <div
              key={i}
              className={
                "interrogation-card space-y-2 transition-colors duration-200 " +
                (isLie ? "!border-lie/45" : "")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <label
                  className={
                    "text-xs font-mono uppercase tracking-widest " +
                    (isLie ? "text-lie" : "text-muted")
                  }
                  htmlFor={`stmt-${i}`}
                >
                  Statement {i + 1}
                </label>
                <span className="text-xs text-muted">
                  {stmt.length}/{MAX_LEN}
                </span>
              </div>

              <textarea
                id={`stmt-${i}`}
                value={stmt}
                onChange={(e) => handleChange(i, e.target.value)}
                placeholder={
                  i === 0
                    ? "I once met a celebrity in an airport…"
                    : i === 1
                      ? "I have never broken a bone…"
                      : "I lived in three countries before turning 18…"
                }
                rows={3}
                maxLength={MAX_LEN}
                disabled={loading}
                className="w-full resize-none rounded-lg border border-border bg-field px-4 py-3 font-mono text-sm text-warm placeholder:text-muted focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
              />

              <label
                className={
                  "inline-flex cursor-pointer items-center gap-2 transition-colors " +
                  (isLie ? "text-lie" : "text-muted hover:text-warm")
                }
              >
                <input
                  type="radio"
                  name="lieIndex"
                  checked={isLie}
                  onChange={() => setLieIndex(i as 0 | 1 | 2)}
                  disabled={loading}
                  className="accent-lie"
                />
                <span className="text-sm">
                  {isLie ? "This is the lie" : "Mark as the lie"}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-center text-sm text-lie" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-truth py-3 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-30"
      >
        {loading ? "Submitting…" : "Submit statements"}
      </button>
    </div>
  );
}
