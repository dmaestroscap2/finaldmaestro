import type { ExtractedNote } from "../shared/schema";

export type DerivedTabEvent = {
  startTime: number;
  duration: number;
  string: number;
  fret: number;
  pitch: string;
};

const STANDARD_TUNING: Array<{ string: number; midi: number }> = [
  { string: 1, midi: 64 },
  { string: 2, midi: 59 },
  { string: 3, midi: 55 },
  { string: 4, midi: 50 },
  { string: 5, midi: 45 },
  { string: 6, midi: 40 },
];

function pitchToMidi(pitch: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(String(pitch).trim());
  if (!m) return null;

  const noteMap: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };

  const note = `${m[1]}${m[2] ?? ""}`;
  const octave = Number.parseInt(m[3]!, 10);
  const semitone = noteMap[note];
  if (!Number.isFinite(octave) || semitone == null) return null;
  return (octave + 1) * 12 + semitone;
}

function pickBestStringForMidi(midi: number): { string: number; fret: number } | null {
  const candidates = STANDARD_TUNING
    .map((open) => ({
      string: open.string,
      fret: midi - open.midi,
    }))
    .filter((candidate) => candidate.fret >= 0 && candidate.fret <= 24);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aPenalty = a.fret > 12 ? a.fret + 12 : a.fret;
    const bPenalty = b.fret > 12 ? b.fret + 12 : b.fret;
    return aPenalty - bPenalty || b.string - a.string;
  });

  return candidates[0] ?? null;
}

export function deriveGuitarTabEventsFromNotes(
  notes: ExtractedNote[] | null | undefined
): DerivedTabEvent[] {
  const input = Array.isArray(notes) ? notes : [];
  const out: DerivedTabEvent[] = [];

  for (const note of input) {
    if (typeof note?.pitch !== "string") continue;
    const midi = pitchToMidi(note.pitch);
    if (midi == null) continue;
    const position = pickBestStringForMidi(midi);
    if (!position) continue;

    out.push({
      startTime:
        typeof note.startTime === "number" && Number.isFinite(note.startTime)
          ? Math.max(0, note.startTime)
          : 0,
      duration:
        typeof note.duration === "number" && Number.isFinite(note.duration)
          ? Math.max(0.01, note.duration)
          : 0.01,
      string: position.string,
      fret: position.fret,
      pitch: note.pitch,
    });
  }

  out.sort((a, b) => a.startTime - b.startTime || a.string - b.string || a.fret - b.fret);
  return out;
}
