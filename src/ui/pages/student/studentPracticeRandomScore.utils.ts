export type PracticeRandomScoreConfig = {
  enabled: boolean;
  // Minimum ms between awarding points for the same stable pitch.
  debounceMs: number;
  minPoints: number;
  maxPoints: number;
};

export const DEFAULT_RANDOM_SCORE_CONFIG: PracticeRandomScoreConfig = {
  enabled: false,
  debounceMs: 450,
  minPoints: 3,
  maxPoints: 12,
};

export type RandomScoreState = {
  points: number;
  lastAwardedAtMs: number;
  lastAwardedPitch: string | null;
};

export const DEFAULT_RANDOM_SCORE_STATE: RandomScoreState = {
  points: 0,
  lastAwardedAtMs: 0,
  lastAwardedPitch: null,
};

function clampInt(n: number, lo: number, hi: number): number {
  const x = Math.round(n);
  return Math.max(lo, Math.min(hi, x));
}

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo + 1;
  return lo + Math.floor(rng() * span);
}

/**
 * Presentation-only scoring mode.
 *
 * Intentionally awards randomized points whenever a stable pitch is detected,
 * regardless of pitch/timing accuracy. This is ONLY for demo/presentation use.
 */
export function applyRandomScoreOnPitch(args: {
  state: RandomScoreState;
  detectedPitch: string | null;
  nowMs: number;
  config: PracticeRandomScoreConfig;
  rng: () => number;
}): RandomScoreState {
  const { state, detectedPitch, nowMs, config, rng } = args;
  if (!config.enabled) return state;
  if (!detectedPitch) return state;

  const debounceMs = Math.max(0, config.debounceMs);
  const samePitch = state.lastAwardedPitch === detectedPitch;
  const withinDebounce = nowMs - state.lastAwardedAtMs < debounceMs;
  if (samePitch && withinDebounce) return state;

  const minPoints = clampInt(config.minPoints, 0, 10_000);
  const maxPoints = clampInt(config.maxPoints, 0, 10_000);
  const award = randomIntInclusive(rng, minPoints, maxPoints);

  return {
    points: Math.max(0, state.points + award),
    lastAwardedAtMs: nowMs,
    lastAwardedPitch: detectedPitch,
  };
}

