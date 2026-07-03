"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/* ===================================================================
   ThemeProvider — manages dark/light theme state.

   Priority: saved localStorage preference → system preference → dark.
   Sets a `data-theme` attribute on <html> that CSS hooks into.
   =================================================================== */

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

const STORAGE_KEY = "ttal_theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  // 1. Saved preference
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;

  // 2. System preference
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";

  // 3. Default
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Hydrate on mount to avoid SSR mismatch
  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable — ignore
    }
  }, [theme, mounted]);

  // Listen for system preference changes (only when no manual override)
  useEffect(() => {
    if (!mounted) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return; // user has explicit preference — don't follow system

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // Prevent flash of wrong theme — render nothing until hydrated
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
