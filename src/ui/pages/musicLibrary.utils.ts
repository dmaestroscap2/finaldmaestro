export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--:--";

  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getNoteCount(row: { notes?: unknown; notesJson?: unknown }): number {
  if (Array.isArray(row.notes)) return row.notes.length;

  if (typeof row.notesJson !== "string") return 0;
  try {
    const parsed = JSON.parse(row.notesJson) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export type PreviewNoteSource = "klang_json" | "midi_quant" | "stored";

type PreviewSourceRow = {
  klangioJson?: unknown;
  klangioMidiQuantPath?: unknown;
  klangio_json?: unknown;
  klangio_midi_quant_path?: unknown;
};

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function choosePreviewNoteSource(
  row: PreviewSourceRow | null | undefined,
  instrument: string | null | undefined
): PreviewNoteSource {
  const hasKlangJson = hasValue(row?.klangioJson) || hasValue(row?.klangio_json);
  const hasMidiQuant = hasValue(row?.klangioMidiQuantPath) || hasValue(row?.klangio_midi_quant_path);

  if (hasKlangJson) return "klang_json";
  if (hasMidiQuant) return "midi_quant";
  return "stored";
}
