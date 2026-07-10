"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GameScenePhase } from "@/types/gameScene";

interface GameSceneContextValue {
  phase: GameScenePhase;
  setPhase: (phase: GameScenePhase) => void;
}

const GameSceneContext = createContext<GameSceneContextValue | null>(null);

export function GameSceneProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<GameScenePhase>("home");
  const value = useMemo(() => ({ phase, setPhase }), [phase]);

  return (
    <GameSceneContext.Provider value={value}>
      {children}
    </GameSceneContext.Provider>
  );
}

export function useGameScene() {
  const context = useContext(GameSceneContext);
  if (!context) {
    throw new Error("useGameScene must be used within GameSceneProvider");
  }
  return context;
}
