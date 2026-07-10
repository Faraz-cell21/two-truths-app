"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameScene } from "@/components/three/GameSceneContext";
import { useThemeColors } from "@/components/three/useThemeColors";
import { SCENE_PHASE_CONFIG } from "@/types/gameScene";
import { getScenePalette } from "@/components/three/scenePalette";

const WAVE_POINTS = 140;
const BURST_COUNT = 120;
const ORB_POSITIONS: [number, number, number][] = [
  [-2.4, 0.15, 0.1],
  [0, -0.15, 0.35],
  [2.4, 0.1, 0.05],
];

function useSmoothedIntensity(target: number, speed = 0.06) {
  const current = useRef(target);

  useFrame(() => {
    current.current = THREE.MathUtils.lerp(current.current, target, speed);
  });

  return current;
}

function CameraDrift({ intensity }: { intensity: number }) {
  const intensityRef = useSmoothedIntensity(intensity, 0.04);
  const { camera } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const strength = intensityRef.current;
    camera.position.x = Math.sin(t * 0.35) * 0.22 * strength;
    camera.position.y = Math.cos(t * 0.28) * 0.12 * strength;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function HorizonGlow({
  truthColor,
  lieColor,
  intensity,
  blending,
  opacityScale,
}: {
  truthColor: string;
  lieColor: string;
  intensity: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const intensityRef = useSmoothedIntensity(intensity, 0.05);

  useFrame((state) => {
    if (!meshRef.current) return;
    const strength = intensityRef.current;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.min(1, (0.08 + strength * 0.18) * opacityScale);
    meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.08;
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 0.2, -4.5]}>
        <planeGeometry args={[18, 10]} />
        <meshBasicMaterial
          color={truthColor}
          transparent
          opacity={Math.min(1, 0.12 * opacityScale)}
          depthWrite={false}
          blending={blending}
        />
      </mesh>
      <mesh position={[4.5, -1.2, -4.3]}>
        <circleGeometry args={[2.8, 48]} />
        <meshBasicMaterial
          color={lieColor}
          transparent
          opacity={Math.min(1, 0.08 * opacityScale)}
          depthWrite={false}
          blending={blending}
        />
      </mesh>
    </group>
  );
}

function PolygraphWave({
  color,
  lieColor,
  intensity,
  blending,
  opacityScale,
  yOffset = 0,
  phaseOffset = 0,
}: {
  color: string;
  lieColor: string;
  intensity: number;
  blending: THREE.Blending;
  opacityScale: number;
  yOffset?: number;
  phaseOffset?: number;
}) {
  const intensityRef = useSmoothedIntensity(intensity, 0.08);
  const points = useMemo(
    () =>
      Array.from(
        { length: WAVE_POINTS },
        (_, index) =>
          new THREE.Vector3((index / (WAVE_POINTS - 1)) * 11 - 5.5, yOffset, -1)
      ),
    [yOffset]
  );

  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, 0.65 * opacityScale),
      blending,
    });
    return new THREE.Line(geometry, material);
  }, [color, points, blending, opacityScale]);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phaseOffset;
    const strength = intensityRef.current;

    points.forEach((point, index) => {
      const progress = index / WAVE_POINTS;
      const x = point.x;
      const spike =
        Math.sin(progress * Math.PI * 7 + t * 4.2) *
        0.14 *
        strength *
        (0.35 + Math.sin(t * 2.1 + progress * 10) * 0.65);
      point.y =
        yOffset +
        Math.sin(x * 1.35 + t * 2.8) * 0.55 * strength +
        Math.sin(x * 2.8 - t * 5.2) * 0.18 * strength +
        spike;
    });

    line.geometry.setFromPoints(points);

    const material = line.material as THREE.LineBasicMaterial;
    material.opacity = Math.min(1, (0.35 + strength * 0.65) * opacityScale);
    material.color.lerp(
      new THREE.Color(strength > 0.7 ? lieColor : color),
      0.05
    );
  });

  return <primitive object={line} />;
}

function ScanGrid({
  color,
  intensity,
  blending,
  opacityScale,
}: {
  color: string;
  intensity: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const gridRef = useRef<THREE.Mesh>(null);
  const intensityRef = useSmoothedIntensity(intensity, 0.05);

  useFrame((state) => {
    if (!gridRef.current) return;
    const strength = intensityRef.current;
    const material = gridRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.min(1, (0.08 + strength * 0.22) * opacityScale);
    gridRef.current.position.y =
      -2.4 + Math.sin(state.clock.elapsedTime * 0.8) * 0.08 * strength;
    gridRef.current.rotation.x =
      -Math.PI / 2.15 + Math.sin(state.clock.elapsedTime * 0.2) * 0.03;
  });

  return (
    <mesh ref={gridRef} position={[0, -2.4, -2.8]} rotation={[-Math.PI / 2.15, 0, 0]}>
      <planeGeometry args={[16, 9, 32, 18]} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={Math.min(1, 0.14 * opacityScale)}
        depthWrite={false}
        blending={blending}
      />
    </mesh>
  );
}

function PulseRings({
  truthColor,
  lieColor,
  intensity,
  blending,
  opacityScale,
}: {
  truthColor: string;
  lieColor: string;
  intensity: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const intensityRef = useSmoothedIntensity(intensity, 0.07);

  useFrame((state) => {
    if (!groupRef.current) return;
    const strength = intensityRef.current;
    const t = state.clock.elapsedTime;
    groupRef.current.visible = strength > 0.05;

    groupRef.current.children.forEach((child, index) => {
      const ring = child as THREE.Mesh;
      const material = ring.material as THREE.MeshBasicMaterial;
      const cycle = (t * (0.55 + index * 0.12) + index * 0.8) % 2.2;
      const scale = 0.8 + cycle * 2.4 * strength;
      ring.scale.setScalar(scale);
      material.opacity = Math.max(
        0,
        Math.min(1, (1 - cycle / 2.2) * 0.35 * strength * opacityScale)
      );
    });
  });

  return (
    <group ref={groupRef} position={[0, -0.2, -0.6]}>
      {[truthColor, lieColor, truthColor].map((ringColor, index) => (
        <mesh key={index} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55 + index * 0.35, 0.62 + index * 0.35, 64]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={Math.min(1, 0.2 * opacityScale)}
            depthWrite={false}
            blending={blending}
          />
        </mesh>
      ))}
    </group>
  );
}

function OrbConnections({
  visible,
  color,
  blending,
  opacityScale,
}: {
  visible: boolean;
  color: string;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const visibility = useRef(visible ? 1 : 0);
  const points = useMemo(
    () => ORB_POSITIONS.map((position) => new THREE.Vector3(...position)),
    []
  );

  const line = useMemo(() => {
    const loop = [...points, points[0]];
    const geometry = new THREE.BufferGeometry().setFromPoints(loop);
    const material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, 0.5 * opacityScale),
      dashSize: 0.18,
      gapSize: 0.12,
      blending,
    });
    const connection = new THREE.Line(geometry, material);
    connection.computeLineDistances();
    return connection;
  }, [color, points, blending, opacityScale]);

  useFrame((_, delta) => {
    visibility.current = THREE.MathUtils.lerp(
      visibility.current,
      visible ? 1 : 0,
      delta * 3
    );
    line.visible = visibility.current > 0.03;
    const material = line.material as THREE.LineDashedMaterial;
    material.opacity = Math.min(1, visibility.current * 0.55 * opacityScale);
  });

  return <primitive object={line} />;
}

function StatementOrbs({
  truthColor,
  lieColor,
  mutedColor,
  visible,
  pulse,
  beamIntensity,
  blending,
  opacityScale,
}: {
  truthColor: string;
  lieColor: string;
  mutedColor: string;
  visible: boolean;
  pulse: boolean;
  beamIntensity: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const beamRefs = useRef<Array<THREE.Mesh | null>>([]);
  const visibility = useRef(visible ? 1 : 0);
  const pulseRef = useRef(0);
  const beamRef = useSmoothedIntensity(beamIntensity, 0.08);

  useEffect(() => {
    if (pulse) {
      pulseRef.current = 1;
    }
  }, [pulse]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    visibility.current = THREE.MathUtils.lerp(
      visibility.current,
      visible ? 1 : 0,
      0.1
    );
    pulseRef.current = THREE.MathUtils.lerp(pulseRef.current, 0, delta * 1.6);
    const beamStrength = beamRef.current;

    groupRef.current.visible = visibility.current > 0.02;
    groupRef.current.scale.setScalar(
      0.85 + visibility.current * 0.2 + pulseRef.current * 0.35
    );

    meshRefs.current.forEach((mesh, index) => {
      if (!mesh) return;

      const material = mesh.material as THREE.MeshStandardMaterial;
      const ring = ringRefs.current[index];
      const beam = beamRefs.current[index];
      const t = state.clock.elapsedTime;
      const baseY = ORB_POSITIONS[index][1];

      mesh.position.y =
        baseY + Math.sin(t * 1.8 + index * 1.5) * 0.18 * visibility.current;
      material.emissiveIntensity =
        0.55 + visibility.current * 1.2 + pulseRef.current * 2;
      material.opacity = 0.45 + visibility.current * 0.5;

      if (ring) {
        ring.visible = visibility.current > 0.05;
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = t * (0.8 + index * 0.15);
        ring.scale.setScalar(1 + pulseRef.current * 0.5);
        const ringMaterial = ring.material as THREE.MeshBasicMaterial;
        ringMaterial.opacity = Math.min(1, (0.15 + visibility.current * 0.35) * opacityScale);
      }

      if (beam) {
        beam.visible = beamStrength > 0.08 && visibility.current > 0.05;
        beam.scale.y = 0.5 + beamStrength * 1.8 + pulseRef.current;
        const beamMaterial = beam.material as THREE.MeshBasicMaterial;
        beamMaterial.opacity = Math.min(
          1,
          beamStrength * 0.18 * visibility.current * opacityScale
        );
      }
    });
  });

  const orbColors = [truthColor, mutedColor, lieColor];

  return (
    <group ref={groupRef}>
      {ORB_POSITIONS.map((position, index) => (
        <group key={index}>
          <mesh
            ref={(node) => {
              beamRefs.current[index] = node;
            }}
            position={[position[0], position[1] - 1.2, position[2]]}
          >
            <cylinderGeometry args={[0.03, 0.18, 2.8, 16, 1, true]} />
            <meshBasicMaterial
              color={orbColors[index]}
              transparent
              opacity={Math.min(1, 0.12 * opacityScale)}
              depthWrite={false}
              blending={blending}
              side={THREE.DoubleSide}
            />
          </mesh>

          <mesh
            ref={(node) => {
              ringRefs.current[index] = node;
            }}
            position={position}
          >
            <torusGeometry args={[0.52, 0.02, 12, 48]} />
            <meshBasicMaterial
              color={orbColors[index]}
              transparent
              opacity={Math.min(1, 0.35 * opacityScale)}
              depthWrite={false}
              blending={blending}
            />
          </mesh>

          <mesh
            ref={(node) => {
              meshRefs.current[index] = node;
            }}
            position={position}
          >
            <sphereGeometry args={[0.42, 32, 32]} />
            <meshStandardMaterial
              color={orbColors[index]}
              emissive={orbColors[index]}
              emissiveIntensity={0.75}
              transparent
              opacity={0.82}
              roughness={0.2}
              metalness={0.35}
            />
          </mesh>

          <pointLight
            color={orbColors[index]}
            intensity={1.4}
            distance={4}
            position={position}
          />
        </group>
      ))}
    </group>
  );
}

function RevealBurst({
  lieColor,
  trigger,
  blending,
  opacityScale,
}: {
  lieColor: string;
  trigger: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const velocities = useRef<Float32Array | null>(null);
  const life = useRef(0);

  const geometry = useMemo(() => {
    const positions = new Float32Array(BURST_COUNT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useEffect(() => {
    if (trigger <= 0) return;
    life.current = 1;
    velocities.current = new Float32Array(BURST_COUNT * 3);
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.02 + Math.random() * 0.06;
      velocities.current[i * 3] = Math.cos(angle) * speed;
      velocities.current[i * 3 + 1] = (Math.random() - 0.2) * speed * 1.4;
      velocities.current[i * 3 + 2] = Math.sin(angle) * speed;
    }
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < BURST_COUNT; i++) {
      positions.setXYZ(
        i,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.2
      );
    }
    positions.needsUpdate = true;
  }, [trigger, geometry]);

  useFrame((_, delta) => {
    if (!pointsRef.current || life.current <= 0 || !velocities.current) return;

    life.current = Math.max(0, life.current - delta * 0.9);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;

    for (let i = 0; i < BURST_COUNT; i++) {
      positions.setXYZ(
        i,
        positions.getX(i) + velocities.current[i * 3],
        positions.getY(i) + velocities.current[i * 3 + 1],
        positions.getZ(i) + velocities.current[i * 3 + 2]
      );
    }
    positions.needsUpdate = true;

    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.opacity = Math.min(1, life.current * 0.9 * opacityScale);
    material.size = 0.05 + life.current * 0.08;
    pointsRef.current.visible = life.current > 0.02;
  });

  return (
    <points ref={pointsRef} geometry={geometry} visible={false}>
      <pointsMaterial
        color={lieColor}
        transparent
        opacity={0}
        size={0.06}
        depthWrite={false}
        blending={blending}
      />
    </points>
  );
}

function CelebrationDrift({
  truthColor,
  intensity,
  blending,
  opacityScale,
}: {
  truthColor: string;
  intensity: number;
  blending: THREE.Blending;
  opacityScale: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const intensityRef = useSmoothedIntensity(intensity, 0.06);

  const geometry = useMemo(() => {
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = Math.random() * 5 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const strength = intensityRef.current;
    pointsRef.current.visible = strength > 0.05;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;

    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) - delta * (0.25 + strength * 0.45);
      if (y < -3) y = 4 + Math.random() * 2;
      positions.setY(i, y);
      positions.setX(
        i,
        positions.getX(i) + Math.sin(state.clock.elapsedTime + i) * 0.002
      );
    }
    positions.needsUpdate = true;

    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.opacity = Math.min(1, (0.2 + strength * 0.5) * opacityScale);
  });

  return (
    <points ref={pointsRef} geometry={geometry} visible={false}>
      <pointsMaterial
        color={truthColor}
        size={0.05}
        transparent
        opacity={Math.min(1, 0.35 * opacityScale)}
        depthWrite={false}
        blending={blending}
      />
    </points>
  );
}

function SceneContent() {
  const { phase } = useGameScene();
  const { colors, isLight } = useThemeColors();
  const palette = getScenePalette(isLight, colors);
  const config = SCENE_PHASE_CONFIG[phase];
  const burstKey = config.revealPulse ? 1 : config.burstIntensity;

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.fog, palette.fogNear, palette.fogFar]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight position={[4, 6, 5]} intensity={0.55} color={colors.warm} />
      <pointLight position={[3, 2, 4]} intensity={1.1} color={palette.truth} />
      <pointLight position={[-4, -1, 3]} intensity={0.85} color={palette.lie} />
      <pointLight position={[0, -2, 2]} intensity={0.4} color={palette.muted} />

      <CameraDrift intensity={config.waveIntensity} />
      <HorizonGlow
        truthColor={palette.truth}
        lieColor={palette.lie}
        intensity={config.particleIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />

      <ScanGrid
        color={palette.muted}
        intensity={config.waveIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />
      <PulseRings
        truthColor={palette.truth}
        lieColor={palette.lie}
        intensity={config.ringIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />

      <PolygraphWave
        color={palette.truth}
        lieColor={palette.lie}
        intensity={config.waveIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
        yOffset={0.15}
      />
      <PolygraphWave
        color={palette.lie}
        lieColor={palette.truth}
        intensity={config.waveIntensity * 0.85}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
        yOffset={-0.35}
        phaseOffset={1.4}
      />
      <PolygraphWave
        color={palette.muted}
        lieColor={palette.lie}
        intensity={config.waveIntensity * 0.55}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
        yOffset={-1.1}
        phaseOffset={2.6}
      />

      <OrbConnections
        visible={config.showOrbs}
        color={palette.muted}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />
      <StatementOrbs
        truthColor={palette.truth}
        lieColor={palette.lie}
        mutedColor={palette.muted}
        visible={config.showOrbs}
        pulse={config.revealPulse}
        beamIntensity={config.beamIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />

      <RevealBurst
        lieColor={palette.lie}
        trigger={config.revealPulse ? burstKey : 0}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
      />
      <CelebrationDrift
        truthColor={palette.truth}
        intensity={config.burstIntensity}
        blending={palette.blend}
        opacityScale={palette.opacityScale}
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
      className="h-full w-full"
      camera={{ position: [0, 0, 6], fov: 48 }}
      dpr={[1, 1.75]}
      frameloop={paused ? "never" : "always"}
      gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
    >
      <SceneContent />
    </Canvas>
  );
}
