"use client";

import { useEffect, useState } from "react";

export interface ThemeColors {
  truth: string;
  lie: string;
  muted: string;
  ink: string;
  warm: string;
}

const FALLBACK_COLORS: ThemeColors = {
  truth: "#4da3ff",
  lie: "#ff4f9a",
  muted: "#dce3f5",
  ink: "#070b16",
  warm: "#ffffff",
};

function readThemeColors(): ThemeColors {
  if (typeof window === "undefined") {
    return FALLBACK_COLORS;
  }

  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    truth: read("--theme-truth", FALLBACK_COLORS.truth),
    lie: read("--theme-lie", FALLBACK_COLORS.lie),
    muted: read("--theme-muted", FALLBACK_COLORS.muted),
    ink: read("--theme-ink", FALLBACK_COLORS.ink),
    warm: read("--theme-warm", FALLBACK_COLORS.warm),
  };
}

function colorsEqual(a: ThemeColors, b: ThemeColors) {
  return (
    a.truth === b.truth &&
    a.lie === b.lie &&
    a.muted === b.muted &&
    a.ink === b.ink &&
    a.warm === b.warm
  );
}

export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK_COLORS);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const update = () => {
      const next = readThemeColors();
      setColors((prev) => (colorsEqual(prev, next) ? prev : next));
      setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    };

    update();

    // Catch CSS HMR / late stylesheet application (stale green/orange cache)
    const t1 = window.setTimeout(update, 50);
    const t2 = window.setTimeout(update, 400);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "class"],
    });

    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer.disconnect();
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return { colors, isLight };
}
