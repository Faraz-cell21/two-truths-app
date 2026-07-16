"use client";

import { useState, useCallback } from "react";

/* ===================================================================
   CopyLinkButton — icon control that copies the room invite URL.

   Always copies the full invite link (origin + /room/CODE), on desktop
   and mobile. Uses clipboard API when available, otherwise a textarea
   fallback (needed on some mobile / non-HTTPS LAN origins).
   =================================================================== */

interface CopyLinkButtonProps {
  roomCode: string;
  className?: string;
}

export default function CopyLinkButton({
  roomCode,
  className = "",
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const roomUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomCode}`
      : "";

  const markCopied = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const writeClipboard = useCallback(async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to textarea method (common on HTTP LAN phones)
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("copy failed");
  }, []);

  const handleCopy = useCallback(async () => {
    const inviteLink = roomUrl || `${window.location.origin}/room/${roomCode}`;

    // Always copy the full invite URL (desktop + mobile).
    try {
      await writeClipboard(inviteLink);
      markCopied();
      return;
    } catch {
      // Clipboard blocked — try native share as a fallback
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Two Truths and a Lie: Join my game",
          text: `Join my game! Room code: ${roomCode}`,
          url: inviteLink,
        });
        markCopied();
        return;
      } catch {
        // cancelled / unavailable
      }
    }

    markCopied();
  }, [roomCode, roomUrl, markCopied, writeClipboard]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        "copy-link-icon relative z-20 inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border/80 bg-card/80 text-muted transition-all hover:border-truth/50 hover:text-truth active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-truth/40 " +
        (copied ? "border-truth/40 text-truth" : "") +
        (className ? ` ${className}` : "")
      }
      title={copied ? "Copied!" : "Copy invite link"}
      aria-label={copied ? "Invite link copied" : "Copy invite link"}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
    </button>
  );
}

function LinkIcon() {
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
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
      aria-hidden="true"
      className="pointer-events-none"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
