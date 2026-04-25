type PracticeMusicPayload = {
  sourceUsed?: string | null;
  tabEvents?: unknown;
  tabMeasureStarts?: unknown;
};

export function extractPracticeTabData(
  music: PracticeMusicPayload | null | undefined,
  instrument: string | null | undefined
): {
  tabEvents: Array<{ startTime?: number; duration?: number; string?: number; fret?: number }>;
  tabMeasureStarts: number[];
} {
  const inst = String(instrument ?? "").trim().toLowerCase();
  if (inst !== "guitar") {
    return { tabEvents: [], tabMeasureStarts: [] };
  }

  const tabEvents = Array.isArray(music?.tabEvents)
    ? (music!.tabEvents as Array<{ startTime?: number; duration?: number; string?: number; fret?: number }>)
    : [];
  const tabMeasureStarts = Array.isArray(music?.tabMeasureStarts)
    ? (music!.tabMeasureStarts as unknown[]).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [];

  if (tabEvents.length === 0) {
    return { tabEvents: [], tabMeasureStarts: [] };
  }

  return { tabEvents, tabMeasureStarts };
}
