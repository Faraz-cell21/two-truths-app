export type GameScenePhase =
  | "home"
  | "lobby"
  | "loading"
  | "submit"
  | "awaiting_statements"
  | "vote"
  | "awaiting_votes"
  | "reveal"
  | "scoreboard"
  | "finished"
  | "error";

export interface ScenePhaseConfig {
  particleIntensity: number;
  waveIntensity: number;
  showOrbs: boolean;
  revealPulse: boolean;
  ringIntensity: number;
  beamIntensity: number;
  burstIntensity: number;
}

/** Quieter defaults — atmosphere over neon noise. */
export const SCENE_PHASE_CONFIG: Record<GameScenePhase, ScenePhaseConfig> = {
  home: {
    particleIntensity: 0.32,
    waveIntensity: 0.28,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.12,
    beamIntensity: 0.08,
    burstIntensity: 0,
  },
  lobby: {
    particleIntensity: 0.4,
    waveIntensity: 0.35,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.22,
    beamIntensity: 0.14,
    burstIntensity: 0,
  },
  loading: {
    particleIntensity: 0.28,
    waveIntensity: 0.22,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.1,
    beamIntensity: 0.06,
    burstIntensity: 0,
  },
  submit: {
    particleIntensity: 0.38,
    waveIntensity: 0.32,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.28,
    beamIntensity: 0.35,
    burstIntensity: 0,
  },
  awaiting_statements: {
    particleIntensity: 0.45,
    waveIntensity: 0.48,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.38,
    beamIntensity: 0.42,
    burstIntensity: 0,
  },
  vote: {
    particleIntensity: 0.55,
    waveIntensity: 0.7,
    showOrbs: true,
    revealPulse: false,
    ringIntensity: 0.65,
    beamIntensity: 0.6,
    burstIntensity: 0,
  },
  awaiting_votes: {
    particleIntensity: 0.58,
    waveIntensity: 0.75,
    showOrbs: true,
    revealPulse: false,
    ringIntensity: 0.72,
    beamIntensity: 0.68,
    burstIntensity: 0,
  },
  reveal: {
    particleIntensity: 0.7,
    waveIntensity: 0.85,
    showOrbs: true,
    revealPulse: true,
    ringIntensity: 0.85,
    beamIntensity: 0.8,
    burstIntensity: 0.75,
  },
  scoreboard: {
    particleIntensity: 0.42,
    waveIntensity: 0.32,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.4,
    beamIntensity: 0.22,
    burstIntensity: 0.25,
  },
  finished: {
    particleIntensity: 0.5,
    waveIntensity: 0.38,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.5,
    beamIntensity: 0.28,
    burstIntensity: 0.4,
  },
  error: {
    particleIntensity: 0.18,
    waveIntensity: 0.14,
    showOrbs: false,
    revealPulse: false,
    ringIntensity: 0.08,
    beamIntensity: 0.04,
    burstIntensity: 0,
  },
};
