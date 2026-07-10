import * as THREE from "three";
import type { ThemeColors } from "@/components/three/useThemeColors";

export interface ScenePalette {
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  truth: string;
  lie: string;
  muted: string;
  accent: string;
  blend: THREE.Blending;
  opacityScale: number;
  ambient: number;
}

export function getScenePalette(
  isLight: boolean,
  colors: ThemeColors
): ScenePalette {
  if (!isLight) {
    return {
      background: colors.ink,
      fog: "#0e0f14",
      fogNear: 8,
      fogFar: 18,
      truth: colors.truth,
      lie: colors.lie,
      muted: "#5c6070",
      accent: "#c8cdd8",
      blend: THREE.AdditiveBlending,
      opacityScale: 0.95,
      ambient: 0.32,
    };
  }

  return {
    background: "#d9dce4",
    fog: "#e6e8ee",
    fogNear: 9,
    fogFar: 20,
    truth: "#3d4f7a",
    lie: "#a33d5c",
    muted: "#7a8090",
    accent: "#4a5568",
    blend: THREE.NormalBlending,
    opacityScale: 1.7,
    ambient: 0.72,
  };
}
