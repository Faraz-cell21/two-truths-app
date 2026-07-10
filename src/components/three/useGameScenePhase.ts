"use client";

import { useEffect } from "react";
import type { GameScenePhase } from "@/types/gameScene";
import { useGameScene } from "@/components/three/GameSceneContext";

export function useGameScenePhase(phase: GameScenePhase) {
  const { setPhase } = useGameScene();

  useEffect(() => {
    setPhase(phase);
  }, [phase, setPhase]);
}
