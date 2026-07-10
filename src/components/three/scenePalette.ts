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
      fog: "#0a1020",
      fogNear: 7,
      fogFar: 16,
      truth: colors.truth,
      lie: colors.lie,
      muted: "#6b7fa8",
      accent: "#9ec5ff",
      blend: THREE.AdditiveBlending,
      opacityScale: 1.05,
      ambient: 0.34,
    };
  }

  return {
    background: "#d4e2ff",
    fog: "#e4edff",
    fogNear: 8,
    fogFar: 18,
    truth: "#0057e7",
    lie: "#d6006e",
    muted: "#4a5f8a",
    accent: "#2f6fed",
    blend: THREE.NormalBlending,
    opacityScale: 1.65,
    ambient: 0.78,
  };
}
