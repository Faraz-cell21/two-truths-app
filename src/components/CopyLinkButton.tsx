"use client";

import { useState, useCallback } from "react";

/* ===================================================================
   CopyLinkButton — copies the room URL to clipboard, with Web Share
   API support on mobile. Shows a brief "Copied!" confirmation.
   =================================================================== */

interface CopyLinkButtonProps {
  roomCode: string;
  variant?: "default" | "compact";
}

export default function CopyLinkButton({
  roomCode,
  variant = "default",
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const roomUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomCode}`
      : "";

  const handleCopy = useCallback(async () => {
    // Try Web Share API first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Two Truths and a Lie: Join my game",
          text: `Join my Two Truths and a Lie game! Room code: ${roomCode}`,
          url: roomUrl,
        });
        return;
      } catch {
        // User cancelled or API failed — fall through to clipboard
      }
    }

    // Fallback: clipboard copy
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — do nothing
    }
  }, [roomCode, roomUrl]);

  if (variant === "compact") {
    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-muted hover:text-warm"
        title="Copy invite link"
      >
        {copied ? (
          <span className="text-truth">Copied!</span>
        ) : (
          <>
            <CopyIcon />
            <span>Copy invite link</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={
        "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-medium text-sm transition-all " +
        (copied
          ? "bg-truth/10 text-truth border border-truth/30"
          : "bg-card border border-border text-warm hover:border-muted")
      }
    >
      {copied ? (
        <>
          <CheckIcon />
          Link copied!
        </>
      ) : (
        <>
          <ShareIcon />
          Share invite link
        </>
      )}
    </button>
  );
}

/* ---- tiny inline icons ---- */

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
