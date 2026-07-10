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
      fog: "#101218",
      fogNear: 10,
      fogFar: 22,
      truth: colors.truth,
      lie: colors.lie,
      muted: "#6f7380",
      accent: "#c8cdd8",
      blend: THREE.AdditiveBlending,
      opacityScale: 0.85,
      ambient: 0.38,
    };
  }

  return {
    background: "#d8dbe3",
    fog: "#e4e6ec",
    fogNear: 12,
    fogFar: 24,
    truth: "#3d4f7a",
    lie: "#a33d5c",
    muted: "#6a7080",
    accent: "#4a5568",
    blend: THREE.NormalBlending,
    opacityScale: 1.9,
    ambient: 0.8,
  };
}
