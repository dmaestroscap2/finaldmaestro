import { pitchToMidi } from "../musicPreview.utils";

export type PracticeExpectedNote = {
  pitch?: string;
  startTime?: number;
  duration?: number;
};

export type PracticeNoteStatus = "pending" | "correct" | "incorrect" | "missed";
export type PracticeTimingGrade = "early" | "perfect" | "late";

export type PracticeScoringConfig = {
  pitchToleranceSemitones: number;
  perfectWindowSec: number;
  earlyWindowSec: number;
  lateWindowSec: number;
  noteWindowSec: number;
  minHoldSec: number;
  longNoteThresholdSec: number;
  longNoteHoldRatio: number;
};

export const DEFAULT_PRACTICE_SCORING_CONFIG: PracticeScoringConfig = {
  // More forgiving defaults to better match real-world mic jitter.
  pitchToleranceSemitones: 2,
  perfectWindowSec: 0.1,
  earlyWindowSec: 0.35,
  lateWindowSec: 0.45,
  noteWindowSec: 0.45,
  minHoldSec: 0.04,
  longNoteThresholdSec: 1.6,
  longNoteHoldRatio: 0.25,
};

function resolveConfig(config: PracticeScoringConfig | undefined): PracticeScoringConfig {
  return config ?? DEFAULT_PRACTICE_SCORING_CONFIG;
}

export function getExpectedNoteIndex(
  notes: PracticeExpectedNote[],
  currentTime: number,
  toleranceOrConfig: number | PracticeScoringConfig = 0.15
): number {
  const toleranceSec =
    typeof toleranceOrConfig === "number"
      ? toleranceOrConfig
      : resolveConfig(toleranceOrConfig).noteWindowSec;
  const t = Number.isFinite(currentTime) ? currentTime : 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const start = typeof note.startTime === "number" ? note.startTime : null;
    const duration = typeof note.duration === "number" ? note.duration : 0;
    if (start == null) continue;
    const end = start + Math.max(0.01, duration);
    if (t >= start - toleranceSec && t <= end + toleranceSec) return i;
  }
  return -1;
}

export function pitchesMatch(expectedPitch: string | null | undefined, playedPitch: string | null | undefined): boolean {
  return pitchesMatchWithConfig(expectedPitch, playedPitch, undefined);
}

export function pitchesMatchWithConfig(
  expectedPitch: string | null | undefined,
  playedPitch: string | null | undefined,
  config: PracticeScoringConfig | undefined
): boolean {
  if (!expectedPitch || !playedPitch) return false;
  const expectedMidi = pitchToMidi(expectedPitch);
  const playedMidi = pitchToMidi(playedPitch);
  if (expectedMidi == null || playedMidi == null) return false;
  const cfg = resolveConfig(config);
  return Math.abs(expectedMidi - playedMidi) <= cfg.pitchToleranceSemitones;
}

export function advanceMissedNotes(
  notes: PracticeExpectedNote[],
  statuses: PracticeNoteStatus[],
  currentTime: number,
  toleranceOrConfig: number | PracticeScoringConfig = 0.15
): PracticeNoteStatus[] {
  const toleranceSec =
    typeof toleranceOrConfig === "number"
      ? toleranceOrConfig
      : resolveConfig(toleranceOrConfig).noteWindowSec;
  const next = statuses.slice();
  const t = Number.isFinite(currentTime) ? currentTime : 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const start = typeof note.startTime === "number" ? note.startTime : null;
    const duration = typeof note.duration === "number" ? note.duration : 0;
    if (start == null) continue;
    const end = start + Math.max(0.01, duration);
    if (t > end + toleranceSec && next[i] === "pending") {
      next[i] = "missed";
    }
  }
  return next;
}

export function summarisePracticeStatuses(statuses: PracticeNoteStatus[]): {
  totalNotes: number;
  correctNotes: number;
  incorrectNotes: number;
  missedNotes: number;
  pendingNotes: number;
} {
  let correctNotes = 0;
  let incorrectNotes = 0;
  let missedNotes = 0;
  let pendingNotes = 0;
  for (const status of statuses) {
    if (status === "correct") correctNotes++;
    else if (status === "incorrect") incorrectNotes++;
    else if (status === "missed") missedNotes++;
    else pendingNotes++;
  }
  return {
    totalNotes: statuses.length,
    correctNotes,
    incorrectNotes,
    missedNotes,
    pendingNotes,
  };
}

export function gradeTimingAgainstNoteStart(
  note: PracticeExpectedNote | undefined,
  currentTime: number,
  config?: PracticeScoringConfig
): PracticeTimingGrade | null {
  const start = typeof note?.startTime === "number" ? note.startTime : null;
  if (start == null || !Number.isFinite(currentTime)) return null;

  const cfg = resolveConfig(config);
  const delta = currentTime - start;
  if (Math.abs(delta) <= cfg.perfectWindowSec) return "perfect";
  if (delta < 0 && Math.abs(delta) <= cfg.earlyWindowSec) return "early";
  if (delta > 0 && delta <= cfg.lateWindowSec) return "late";
  return null;
}

export function evaluateDetectedPracticeFrame(args: {
  notes: PracticeExpectedNote[];
  statuses: PracticeNoteStatus[];
  timingGrades: Array<PracticeTimingGrade | null>;
  heldDurations: number[];
  currentTime: number;
  playedPitch: string | null;
  frameDurationSec: number;
  config?: PracticeScoringConfig;
}): {
  statuses: PracticeNoteStatus[];
  timingGrades: Array<PracticeTimingGrade | null>;
  heldDurations: number[];
  matchedIndex: number;
  wrongHit: boolean;
} {
  const {
    notes,
    statuses,
    timingGrades,
    heldDurations,
    currentTime,
    playedPitch,
    frameDurationSec,
    config,
  } = args;

  const cfg = resolveConfig(config);
  const nextStatuses = advanceMissedNotes(notes, statuses, currentTime, cfg);
  const nextTimingGrades = timingGrades.slice();
  const nextHeldDurations = heldDurations.slice();
  const matchedIndex = getExpectedNoteIndex(notes, currentTime, cfg);

  if (matchedIndex < 0 || !playedPitch) {
    return {
      statuses: nextStatuses,
      timingGrades: nextTimingGrades,
      heldDurations: nextHeldDurations,
      matchedIndex,
      wrongHit: false,
    };
  }

  const isMatchable = (status: PracticeNoteStatus | undefined) => status === "pending" || status === "incorrect";

  const findMatchingPendingIndex = () => {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < notes.length; i++) {
      if (!isMatchable(nextStatuses[i])) continue;
      const n = notes[i];
      const start = typeof n?.startTime === "number" ? n.startTime : null;
      const duration = typeof n?.duration === "number" ? n.duration : 0;
      if (start == null) continue;
      const end = start + Math.max(0.01, duration);
      if (currentTime < start - cfg.noteWindowSec || currentTime > end + cfg.noteWindowSec) continue;
      if (!pitchesMatchWithConfig(n?.pitch, playedPitch, cfg)) continue;
      const dist = Math.abs(currentTime - start);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  // Prefer the expected-note index, but if it doesn't match (e.g. overlapping notes/chords),
  // select the closest pending matching note within the active window.
  const primary = notes[matchedIndex];
  const primaryOk =
    primary &&
    isMatchable(nextStatuses[matchedIndex]) &&
    pitchesMatchWithConfig(primary.pitch, playedPitch, cfg);
  const resolvedIndex = primaryOk ? matchedIndex : findMatchingPendingIndex();

  const expectedNote = resolvedIndex >= 0 ? notes[resolvedIndex] : null;
  if (!expectedNote || !isMatchable(nextStatuses[resolvedIndex])) {
    // If the player is within an active note window but played a mismatching pitch, mark that note incorrect
    // (so the UI can highlight it red and it won't later be treated as "missed").
    if (matchedIndex >= 0 && isMatchable(nextStatuses[matchedIndex])) {
      nextStatuses[matchedIndex] = "incorrect";
      return {
        statuses: nextStatuses,
        timingGrades: nextTimingGrades,
        heldDurations: nextHeldDurations,
        matchedIndex,
        wrongHit: true,
      };
    }

    return {
      statuses: nextStatuses,
      timingGrades: nextTimingGrades,
      heldDurations: nextHeldDurations,
      matchedIndex: resolvedIndex >= 0 ? resolvedIndex : matchedIndex,
      wrongHit: false,
    };
  }

  const start = typeof expectedNote.startTime === "number" ? expectedNote.startTime : null;
  const duration = Math.max(0.01, Number(expectedNote.duration ?? 0));
  const end = start == null ? null : start + duration;
  const delta = start == null ? 0 : currentTime - start;

  const gradeTimingWithinNote = (): PracticeTimingGrade | null => {
    if (start == null || end == null) return null;
    if (currentTime >= start && currentTime <= end) return "perfect";
    if (delta < 0 && Math.abs(delta) <= cfg.earlyWindowSec) return "early";
    if (currentTime > end && currentTime - end <= cfg.lateWindowSec) return "late";
    return null;
  };

  const timingGrade =
    nextTimingGrades[resolvedIndex] ??
    gradeTimingAgainstNoteStart(expectedNote, currentTime, cfg) ??
    gradeTimingWithinNote() ??
    // If we matched within the note window but couldn't grade precisely, still treat it as acceptable timing.
    (start != null ? (delta < 0 ? "early" : "late") : null);
  if (timingGrade != null) nextTimingGrades[resolvedIndex] = timingGrade;

  const nextHeld = (nextHeldDurations[resolvedIndex] ?? 0) + Math.max(0, frameDurationSec);
  nextHeldDurations[resolvedIndex] = nextHeld;

  const requiredHold =
    duration >= cfg.longNoteThresholdSec ? Math.max(cfg.minHoldSec, duration * cfg.longNoteHoldRatio) : cfg.minHoldSec;
  if (nextHeld >= requiredHold && nextTimingGrades[resolvedIndex] != null) {
    nextStatuses[resolvedIndex] = "correct";
  }

  return {
    statuses: nextStatuses,
    timingGrades: nextTimingGrades,
    heldDurations: nextHeldDurations,
    matchedIndex: resolvedIndex,
    wrongHit: false,
  };
}
