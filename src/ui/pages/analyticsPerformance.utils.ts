import type { PracticeTimingGrade } from "../../../shared/practicePolicy";

export type PracticeNoteStatus = "pending" | "correct" | "incorrect" | "missed";

export type PracticePerformanceEvent = {
  expectedPitch?: string | null;
  startTime?: number | null;
  duration?: number | null;
  status?: PracticeNoteStatus | null;
  timingGrade?: PracticeTimingGrade | null;
  heldDuration?: number | null;
};

export function parsePerformanceEvents(input: unknown): PracticePerformanceEvent[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      expectedPitch: typeof row.expectedPitch === "string" ? row.expectedPitch : null,
      startTime: typeof row.startTime === "number" ? row.startTime : null,
      duration: typeof row.duration === "number" ? row.duration : null,
      status:
        row.status === "pending" || row.status === "correct" || row.status === "incorrect" || row.status === "missed"
          ? row.status
          : null,
      timingGrade: row.timingGrade === "early" || row.timingGrade === "perfect" || row.timingGrade === "late" ? row.timingGrade : null,
      heldDuration: typeof row.heldDuration === "number" ? row.heldDuration : null,
    }));
}

export function extractSessionPerformanceEvents(session: any): PracticePerformanceEvent[] {
  if (Array.isArray(session?.performanceData)) return parsePerformanceEvents(session.performanceData);

  if (typeof session?.performanceJson === "string" && session.performanceJson.trim()) {
    try {
      const parsed = JSON.parse(session.performanceJson);
      return parsePerformanceEvents(parsed);
    } catch {
      return [];
    }
  }

  if (Array.isArray(session?.performanceJson)) {
    return parsePerformanceEvents(session.performanceJson);
  }

  return [];
}

export type TimingBreakdown = {
  total: number;
  perfect: number;
  early: number;
  late: number;
  perfectPct: number;
  earlyPct: number;
  latePct: number;
  estimated?: boolean;
};

export function summariseTiming(
  events: PracticePerformanceEvent[],
  opts?: {
    fallbackSessions?: Array<{ timingScore?: unknown; totalNotes?: unknown }>;
  }
): TimingBreakdown {
  let perfect = 0;
  let early = 0;
  let late = 0;

  for (const event of events) {
    if (event.timingGrade === "perfect") perfect += 1;
    else if (event.timingGrade === "early") early += 1;
    else if (event.timingGrade === "late") late += 1;
  }

  let total = perfect + early + late;

  const estimateFromScore = (timingScoreRaw: unknown, totalNotesRaw: unknown) => {
    const totalNotes = Math.max(0, Math.round(Number(totalNotesRaw ?? 0)));
    const timingScore = Math.max(0, Math.min(100, Math.round(Number(timingScoreRaw ?? 0))));
    if (!Number.isFinite(totalNotes) || totalNotes <= 0) return { perfect: 0, early: 0, late: 0 };
    if (!Number.isFinite(timingScore) || timingScore <= 0) return { perfect: 0, early: 0, late: 0 };

    if (timingScore >= 90) {
      const perfectRatio = Math.max(0, Math.min(1, (timingScore - 90) / 10));
      const perfect = Math.max(0, Math.min(totalNotes, Math.round(totalNotes * perfectRatio)));
      const remaining = Math.max(0, totalNotes - perfect);
      const early = Math.floor(remaining / 2);
      const late = Math.max(0, remaining - early);
      return { perfect, early, late };
    }

    const gradedRatio = Math.max(0, Math.min(1, timingScore / 90));
    const graded = Math.max(0, Math.min(totalNotes, Math.round(totalNotes * gradedRatio)));
    const early = Math.floor(graded / 2);
    const late = Math.max(0, graded - early);
    return { perfect: 0, early, late };
  };

  let estimated = false;
  const fallbackSessions = opts?.fallbackSessions;
  if (total === 0 && Array.isArray(fallbackSessions) && fallbackSessions.length > 0) {
    for (const session of fallbackSessions) {
      const est = estimateFromScore(session?.timingScore, session?.totalNotes);
      perfect += est.perfect;
      early += est.early;
      late += est.late;
    }
    total = perfect + early + late;
    estimated = total > 0;
  }

  const toPct = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return {
    total,
    perfect,
    early,
    late,
    perfectPct: toPct(perfect),
    earlyPct: toPct(early),
    latePct: toPct(late),
    ...(estimated ? { estimated: true } : null),
  };
}

export function summariseTroubleNotes(
  events: PracticePerformanceEvent[],
  opts?: { limit?: number }
): Array<{
  pitch: string;
  total: number;
  missed: number;
  incorrect: number;
  trouble: number;
  troubleRatePct: number;
}> {
  const limit = Math.max(1, Math.min(25, Math.trunc(opts?.limit ?? 8)));
  const map = new Map<string, { total: number; missed: number; incorrect: number }>();

  for (const event of events) {
    const pitch = String(event.expectedPitch ?? "").trim();
    if (!pitch) continue;
    const entry = map.get(pitch) ?? { total: 0, missed: 0, incorrect: 0 };
    entry.total += 1;
    if (event.status === "missed") entry.missed += 1;
    else if (event.status === "incorrect") entry.incorrect += 1;
    map.set(pitch, entry);
  }

  return Array.from(map.entries())
    .map(([pitch, entry]) => {
      const trouble = entry.missed + entry.incorrect;
      return {
        pitch,
        total: entry.total,
        missed: entry.missed,
        incorrect: entry.incorrect,
        trouble,
        troubleRatePct: entry.total > 0 ? Math.round((trouble / entry.total) * 100) : 0,
      };
    })
    .filter((row) => row.trouble > 0)
    .sort((a, b) => b.troubleRatePct - a.troubleRatePct || b.trouble - a.trouble || b.total - a.total || a.pitch.localeCompare(b.pitch))
    .slice(0, limit);
}
