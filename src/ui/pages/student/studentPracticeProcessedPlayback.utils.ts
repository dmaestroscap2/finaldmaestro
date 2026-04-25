import type { PracticeExpectedNote } from "./studentPracticeSession.utils";

export function resolvePracticePlaybackSource(notes: PracticeExpectedNote[]): "synth" | "none" {
  return Array.isArray(notes) && notes.length > 0 ? "synth" : "none";
}

export function computePracticeMediaElapsed(params: {
  isRunning: boolean;
  baseMediaSec: number;
  basePerfMs: number | null;
  nowPerfMs: number;
  playbackRate: number;
}): number {
  if (!params.isRunning || params.basePerfMs == null) {
    return Math.max(0, params.baseMediaSec);
  }

  const deltaSec = Math.max(0, (params.nowPerfMs - params.basePerfMs) / 1000);
  return Math.max(0, params.baseMediaSec + deltaSec * params.playbackRate);
}

export function buildRemainingPracticeNotes(
  notes: PracticeExpectedNote[],
  fromMediaSec: number,
  playbackRate: number
): Array<{ pitch: string; offsetSec: number; durationSec: number }> {
  const safeRate = playbackRate > 0 ? playbackRate : 1;
  const out: Array<{ pitch: string; offsetSec: number; durationSec: number }> = [];

  for (const note of notes) {
    const pitch = typeof note.pitch === "string" ? note.pitch : null;
    const start = typeof note.startTime === "number" && Number.isFinite(note.startTime) ? note.startTime : 0;
    const duration =
      typeof note.duration === "number" && Number.isFinite(note.duration) ? Math.max(0.01, note.duration) : 0.01;
    const end = start + duration;

    if (!pitch || end <= fromMediaSec) continue;

    const remainingStart = Math.max(0, start - fromMediaSec);
    const remainingDuration = end - Math.max(start, fromMediaSec);

    out.push({
      pitch,
      offsetSec: remainingStart / safeRate,
      durationSec: Math.max(0.01, remainingDuration / safeRate),
    });
  }

  return out;
}
