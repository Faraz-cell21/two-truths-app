"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useGameScene } from "@/components/three/GameSceneContext";
import { useThemeColors } from "@/components/three/useThemeColors";
import { SCENE_PHASE_CONFIG } from "@/types/gameScene";
import { getScenePalette } from "@/components/three/scenePalette";

type CardSpec = {
  position: [number, number, number];
  rotation: [number, number, number];
  accent: "truth" | "lie" | "muted";
  floatSpeed: number;
  floatIntensity: number;
};

const IDLE_CARDS: CardSpec[] = [
  {
    position: [-2.6, 0.55, -1.2],
    rotation: [0.08, 0.45, -0.12],
    accent: "truth",
    floatSpeed: 1.1,
    floatIntensity: 0.35,
  },
  {
    position: [0.15, 0.9, -1.8],
    rotation: [-0.05, -0.15, 0.06],
    accent: "muted",
    floatSpeed: 0.9,
    floatIntensity: 0.28,
  },
  {
    position: [2.5, 0.35, -1.0],
    rotation: [0.1, -0.5, 0.14],
    accent: "lie",
    floatSpeed: 1.25,
    floatIntensity: 0.4,
  },
];

function useSmoothed(target: number, speed = 0.06) {
  const current = useRef(target);
  useFrame(() => {
    current.current = THREE.MathUtils.lerp(current.current, target, speed);
  });
  return current;
}

function Room({
  wall,
  floor,
  isLight,
}: {
  wall: string;
  floor: string;
  isLight: boolean;
}) {
  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 1.2, -4.2]}>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial
          color={wall}
          roughness={0.95}
          metalness={0}
          transparent
          opacity={isLight ? 0.55 : 0.9}
        />
      </mesh>
      {/* Floor */}
      <mesh position={[0, -2.2, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial
          color={floor}
          roughness={0.9}
          metalness={0.05}
          transparent
          opacity={isLight ? 0.45 : 0.85}
        />
      </mesh>
      {/* Desk */}
      <mesh position={[0, -1.55, 0.4]}>
        <boxGeometry args={[5.2, 0.12, 2.2]} />
        <meshStandardMaterial
          color={isLight ? "#8b7355" : "#2a221c"}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, -1.85, 0.4]}>
        <boxGeometry args={[4.8, 0.5, 1.9]} />
        <meshStandardMaterial
          color={isLight ? "#6f5a42" : "#1c1713"}
          roughness={0.85}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** Cinematic window blinds — interrogation noir, not math. */
function WindowBlinds({
  color,
  intensity,
}: {
  color: string;
  intensity: number;
}) {
  const group = useRef<THREE.Group>(null);
  const strength = useSmoothed(intensity, 0.05);

  useFrame((state) => {
    if (!group.current) return;
    const pulse = 0.55 + Math.sin(state.clock.elapsedTime * 0.35) * 0.08;
    group.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(
        0.22,
        (0.04 + strength.current * 0.12) * pulse * (1 - i * 0.04)
      );
    });
  });

  return (
    <group ref={group} position={[-4.2, 1.1, -3.6]} rotation={[0, 0.55, 0]}>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[i * 0.28, 0, 0]}>
          <planeGeometry args={[0.12, 5.5]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.08}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function DeskLamp({
  glow,
  intensity,
}: {
  glow: string;
  intensity: number;
}) {
  const bulb = useRef<THREE.Mesh>(null);
  const strength = useSmoothed(intensity, 0.05);

  useFrame((state) => {
    if (!bulb.current) return;
    const flicker =
      0.85 + Math.sin(state.clock.elapsedTime * 2.4) * 0.04 * strength.current;
    const mat = bulb.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.2 * flicker * (0.5 + strength.current);
  });

  return (
    <group position={[1.7, -1.48, 0.9]}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.08, 20]} />
        <meshStandardMaterial color="#1a1a1c" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Arm */}
      <mesh position={[-0.15, 0.45, 0]} rotation={[0, 0, 0.35]}>
        <cylinderGeometry args={[0.035, 0.035, 0.9, 10]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* Shade */}
      <mesh position={[-0.42, 0.95, 0]} rotation={[0.4, 0, -0.5]}>
        <coneGeometry args={[0.32, 0.38, 24, 1, true]} />
        <meshStandardMaterial
          color="#3a342c"
          roughness={0.6}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Bulb */}
      <mesh ref={bulb} position={[-0.42, 0.82, 0.05]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={glow}
          emissive={glow}
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
        />
      </mesh>
      <pointLight
        color={glow}
        intensity={2.2}
        distance={7}
        decay={2}
        position={[-0.42, 0.75, 0.1]}
      />
      <spotLight
        color={glow}
        intensity={2.8}
        angle={0.6}
        penumbra={0.75}
        distance={8}
        position={[-0.35, 1.0, 0.3]}
        rotation={[-0.9, 0.2, 0]}
      />
    </group>
  );
}

function GameCard({
  spec,
  colors,
  energy,
  highlight,
}: {
  spec: CardSpec;
  colors: { truth: string; lie: string; muted: string; face: string; edge: string };
  energy: number;
  highlight: boolean;
}) {
  const accent =
    spec.accent === "truth"
      ? colors.truth
      : spec.accent === "lie"
        ? colors.lie
        : colors.muted;

  const group = useRef<THREE.Group>(null);
  const energyRef = useSmoothed(energy, 0.07);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const e = energyRef.current;
    // Subtle “alive” sway on top of Float
    group.current.rotation.z =
      spec.rotation[2] + Math.sin(t * 0.6 + spec.position[0]) * 0.03 * e;
    if (highlight && spec.accent === "lie") {
      group.current.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    }
  });

  return (
    <Float
      speed={spec.floatSpeed}
      rotationIntensity={0.15 + energy * 0.2}
      floatIntensity={spec.floatIntensity * (0.6 + energy * 0.6)}
    >
      <group ref={group} position={spec.position} rotation={spec.rotation}>
        {/* Card body */}
        <RoundedBox args={[1.35, 1.85, 0.06]} radius={0.08} smoothness={4}>
          <meshStandardMaterial
            color={colors.face}
            roughness={0.45}
            metalness={0.05}
            emissive={accent}
            emissiveIntensity={highlight && spec.accent === "lie" ? 0.25 : 0.06}
          />
        </RoundedBox>
        {/* Accent stripe — reads as a game card, not a primitive */}
        <mesh position={[0, 0.72, 0.035]}>
          <planeGeometry args={[1.05, 0.12]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.55}
            roughness={0.4}
          />
        </mesh>
        {/* Fake “text lines” on the card */}
        {[0.25, 0.05, -0.15, -0.35].map((y, i) => (
          <mesh key={i} position={[0, y, 0.035]}>
            <planeGeometry args={[0.85 - i * 0.08, 0.06]} />
            <meshBasicMaterial
              color={colors.edge}
              transparent
              opacity={0.22 + (i === 3 ? 0.08 : 0)}
            />
          </mesh>
        ))}
        {/* Soft rim light feel */}
        <pointLight
          color={accent}
          intensity={0.35 + energy * 0.5}
          distance={2.5}
          position={[0, 0, 0.4]}
        />
      </group>
    </Float>
  );
}

function CardTable({
  palette,
  isLight,
  energy,
  revealPulse,
  showFocus,
}: {
  palette: ReturnType<typeof getScenePalette>;
  isLight: boolean;
  energy: number;
  revealPulse: boolean;
  showFocus: boolean;
}) {
  const cards = useMemo(() => {
    if (!showFocus) return IDLE_CARDS;
    // Pull cards into a clearer “choose one” spread during vote/reveal
    return [
      {
        ...IDLE_CARDS[0],
        position: [-1.7, 0.15, 0.2] as [number, number, number],
        rotation: [0.02, 0.25, -0.05] as [number, number, number],
      },
      {
        ...IDLE_CARDS[1],
        position: [0, 0.25, 0.45] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
      },
      {
        ...IDLE_CARDS[2],
        position: [1.7, 0.15, 0.2] as [number, number, number],
        rotation: [0.02, -0.25, 0.05] as [number, number, number],
      },
    ];
  }, [showFocus]);

  const face = isLight ? "#f7faff" : "#1a2440";
  const edge = isLight ? "#0057e7" : "#9ec5ff";

  return (
    <group>
      {cards.map((spec) => (
        <GameCard
          key={spec.accent}
          spec={spec}
          energy={energy}
          highlight={revealPulse}
          colors={{
            truth: palette.truth,
            lie: palette.lie,
            muted: palette.muted,
            face,
            edge,
          }}
        />
      ))}
    </group>
  );
}

/** Tiny paper scraps on the desk — sells the “case file” game fantasy. */
function DeskPapers({ isLight }: { isLight: boolean }) {
  const paper = isLight ? "#efe8dc" : "#2c2a26";
  return (
    <group position={[0, -1.46, 0.55]}>
      <mesh position={[-1.1, 0.02, 0.15]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <planeGeometry args={[0.9, 1.15]} />
        <meshStandardMaterial color={paper} roughness={0.9} />
      </mesh>
      <mesh position={[-0.85, 0.03, -0.1]} rotation={[-Math.PI / 2, 0, -0.35]}>
        <planeGeometry args={[0.7, 0.95]} />
        <meshStandardMaterial color={paper} roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 0.02, 0.05]} rotation={[-Math.PI / 2, 0, 0.08]}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshStandardMaterial color={paper} roughness={0.85} />
      </mesh>
    </group>
  );
}

function SceneContent() {
  const { phase } = useGameScene();
  const { colors, isLight } = useThemeColors();
  const palette = getScenePalette(isLight, colors);
  const config = SCENE_PHASE_CONFIG[phase];

  const energy = Math.max(
    config.particleIntensity,
    config.waveIntensity,
    config.beamIntensity * 0.5
  );

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.fog, 6, 16]} />
      <ambientLight intensity={isLight ? 0.75 : 0.28} />
      <directionalLight
        position={[3, 6, 4]}
        intensity={isLight ? 0.55 : 0.35}
        color={isLight ? "#f0f6ff" : "#a8c4ff"}
      />

      <Room
        wall={isLight ? "#c9dbff" : "#0c1428"}
        floor={isLight ? "#b7caf0" : "#060a14"}
        isLight={isLight}
      />
      <WindowBlinds color={palette.truth} intensity={energy} />
      <DeskLamp glow={palette.truth} intensity={energy} />
      <DeskPapers isLight={isLight} />
      <CardTable
        palette={palette}
        isLight={isLight}
        energy={energy}
        revealPulse={config.revealPulse}
        showFocus={config.showOrbs}
      />
    </>
  );
}

export default function InterrogationScene({
  paused,
}: {
  paused: boolean;
}) {
  return (
    <Canvas
      className="pointer-events-none h-full w-full"
      camera={{ position: [0, 0.35, 5.4], fov: 42 }}
      dpr={[1, 1.6]}
      frameloop={paused ? "never" : "always"}
      gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
    >
      <SceneContent />
    </Canvas>
  );
}
