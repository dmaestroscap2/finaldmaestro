export const MIN_PRACTICE_PLAYBACK_RATE = 0.5;
export const MAX_PRACTICE_PLAYBACK_RATE = 2;
export const DEFAULT_PRACTICE_PLAYBACK_RATE = 1;

type PracticeRateAudioLike = {
  playbackRate: number;
  defaultPlaybackRate?: number;
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

export function clampPracticePlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_PRACTICE_PLAYBACK_RATE;
  return Math.min(MAX_PRACTICE_PLAYBACK_RATE, Math.max(MIN_PRACTICE_PLAYBACK_RATE, rate));
}

export function formatPracticePlaybackRate(rate: number): string {
  const safeRate = clampPracticePlaybackRate(rate);
  const rounded = Math.round(safeRate * 10) / 10;
  return `${rounded.toFixed(1)}x`;
}

export function applyPracticePlaybackRate(
  audio: PracticeRateAudioLike | null | undefined,
  rate: number
): number {
  const safeRate = clampPracticePlaybackRate(rate);
  if (!audio) return safeRate;

  audio.defaultPlaybackRate = safeRate;
  audio.playbackRate = safeRate;

  if ("preservesPitch" in audio) audio.preservesPitch = false;
  if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = false;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = false;

  return safeRate;
}
