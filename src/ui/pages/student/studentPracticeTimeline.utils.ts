export function resolvePracticeVisualElapsed(params: {
  isReferencePlaying: boolean;
  audioCurrentTime: number | null | undefined;
  elapsedSec: number;
}): number {
  if (
    params.isReferencePlaying &&
    typeof params.audioCurrentTime === "number" &&
    Number.isFinite(params.audioCurrentTime) &&
    params.audioCurrentTime >= 0
  ) {
    return params.audioCurrentTime;
  }

  return Math.max(0, params.elapsedSec);
}
