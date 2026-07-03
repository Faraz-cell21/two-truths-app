"use client";

import { useState } from "react";

/* ===================================================================
   StatementForm — the submitter writes 3 statements and marks the lie.

   Three numbered text areas in a vertical stack, each with a radio
   button to mark it as the lie. Only one lie can be selected. Submit
   is disabled until all 3 have content and the lie is chosen.
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
      <div className="interrogation-card text-center space-y-3">
        <p className="font-mono text-lg font-semibold text-truth">
          Statements submitted
        </p>
        <p className="text-sm text-muted">
          Waiting for the others to vote…
        </p>
        <hr className="polygraph-line" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="text-center space-y-2">
        <h2 className="font-serif text-xl font-semibold text-warm">
          Your turn, detective
        </h2>
        <p className="text-sm text-muted">
          Write two truths and one lie. Mark the lie.
        </p>
      </header>

      <div className="space-y-4">
        {statements.map((stmt, i) => (
          <div key={i} className="interrogation-card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <label
                className="text-xs font-mono uppercase tracking-widest text-muted"
                htmlFor={`stmt-${i}`}
              >
                Statement {i + 1}
              </label>
              <span className="text-xs text-muted/60">
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
              className="w-full resize-none rounded-lg border border-border bg-ink px-4 py-3 font-mono text-sm text-warm placeholder:text-muted/50 focus:border-truth focus:outline-none focus:ring-1 focus:ring-truth transition-colors"
            />

            <label
              className={
                "inline-flex items-center gap-2 cursor-pointer transition-colors " +
                (lieIndex === i
                  ? "text-lie"
                  : "text-muted hover:text-warm")
              }
            >
              <input
                type="radio"
                name="lieIndex"
                checked={lieIndex === i}
                onChange={() => setLieIndex(i as 0 | 1 | 2)}
                disabled={loading}
                className="accent-lie"
              />
              <span className="text-sm">
                {lieIndex === i ? "This is the lie" : "Mark as the lie"}
              </span>
            </label>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-lie text-center" role="alert">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-truth py-3 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-30"
      >
        {loading ? "Submitting…" : "Submit statements"}
      </button>
    </div>
  );
}
