import { GameSceneProvider } from "@/components/three/GameSceneContext";
import GameBackground from "@/components/three/GameBackground";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GameSceneProvider>
      <GameBackground />
      <div className="relative z-10">{children}</div>
    </GameSceneProvider>
  );
}
