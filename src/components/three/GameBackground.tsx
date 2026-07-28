"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const InterrogationScene = dynamic(
  () => import("@/components/three/InterrogationScene"),
  { ssr: false }
);

export default function GameBackground() {
  const [enabled, setEnabled] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateEnabled = () => setEnabled(!motionQuery.matches);
    updateEnabled();
    motionQuery.addEventListener("change", updateEnabled);

    const handleVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      motionQuery.removeEventListener("change", updateEnabled);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // The canvas paints its own opaque background (gl alpha: false), so the body
  // may only go transparent while the canvas is actually mounted — otherwise
  // the page falls through to the browser's default white.
  useEffect(() => {
    document.body.style.background = enabled ? "transparent" : "";
    return () => {
      document.body.style.background = "";
    };
  }, [enabled]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full overflow-hidden"
    >
      {enabled && <InterrogationScene paused={paused} />}
      <div className="game-bg-overlay absolute inset-0" />
    </div>
  );
}
