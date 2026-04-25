import type { ExtractedNote } from "../shared/schema";

type KlangioScoreJson = {
  MusicInfo?: {
    Tempo?: number;
    TimeSignature?: string; // "4/4"
    MeasureDuration?: number; // usually 1.0
  };
  Parts?: Array<{
    Name?: string;
    Tab?: boolean;
    Measures?: Array<{
      TimeStamp?: number; // seconds
      MeasureDuration?: number;
      Voices?: Array<{
        Notes?: Array<{
          Midi?: number[];
          Duration?: number; // fraction of measure duration
          TabPosition?: Array<{ fret: number; str: number }>;
          TieStart?: boolean;
          TieStop?: boolean;
        }>;
      }>;
    }>;
  }>;
};

export type TabEvent = {
  startTime: number;
  duration: number;
  string: number; // 1..6 (1 = high E)
  fret: number;
  midi?: number;
  pitch?: string;
};

function midiToPitchName(midiNumber: number): string {
  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
  const pitchClass = pitchClasses[((midiNumber % 12) + 12) % 12]!;
  const octave = Math.floor(midiNumber / 12) - 1;
  return `${pitchClass}${octave}`;
}

function parseTimeSignature(ts: string | null | undefined): { num: number; den: number } {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(ts ?? "").trim());
  if (!m) return { num: 4, den: 4 };
  const num = Number.parseInt(m[1]!, 10);
  const den = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return { num: 4, den: 4 };
  return { num, den };
}

function measureSeconds(params: { tempo: number; timeSignature: string | null | undefined }): number {
  const tempo = Number.isFinite(params.tempo) && params.tempo > 0 ? params.tempo : 120;
  const { num, den } = parseTimeSignature(params.timeSignature);
  const beatSeconds = (60 / tempo) * (4 / den);
  return num * beatSeconds;
}

export function klangioJsonToTabEvents(score: KlangioScoreJson, partName: string | null): {
  tabEvents: TabEvent[];
  measureStarts: number[];
  tempo: number;
  timeSignature: string;
} {
  const tempo = Number.isFinite(score?.MusicInfo?.Tempo) ? Number(score.MusicInfo!.Tempo) : 120;
  const timeSignature = String(score?.MusicInfo?.TimeSignature ?? "4/4");
  const mDurDefault =
    typeof score?.MusicInfo?.MeasureDuration === "number" && score.MusicInfo!.MeasureDuration! > 0
      ? score.MusicInfo!.MeasureDuration!
      : 1;
  const secPerMeasure = measureSeconds({ tempo, timeSignature });

  const parts = Array.isArray(score?.Parts) ? score.Parts : [];
  const part =
    partName != null
      ? parts.find((p) => String(p?.Name ?? "").trim().toLowerCase() === String(partName).trim().toLowerCase())
      : parts[0];

  const measures = Array.isArray(part?.Measures) ? part!.Measures : [];
  const out: TabEvent[] = [];
  const measureStarts: number[] = [];
  const activeTiesByVoice = new Map<number, Map<string, TabEvent>>();

  for (const measure of measures) {
    const base = typeof measure?.TimeStamp === "number" && Number.isFinite(measure.TimeStamp) ? measure.TimeStamp : 0;
    if (Number.isFinite(base) && base >= 0) measureStarts.push(base);
    const mDur =
      typeof measure?.MeasureDuration === "number" && Number.isFinite(measure.MeasureDuration) && measure.MeasureDuration > 0
        ? measure.MeasureDuration
        : mDurDefault;

    const voices = Array.isArray(measure?.Voices) ? measure!.Voices : [];
    for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex++) {
      const voice = voices[voiceIndex]!;
      const notes = Array.isArray(voice?.Notes) ? voice!.Notes : [];
      let t = 0;
      const activeTies = activeTiesByVoice.get(voiceIndex) ?? new Map<string, TabEvent>();
      activeTiesByVoice.set(voiceIndex, activeTies);

      for (const n of notes) {
        const durUnits = typeof n?.Duration === "number" && Number.isFinite(n.Duration) ? n.Duration : 0;
        const durSec = Math.max(0, (durUnits / mDur) * secPerMeasure);
        const startTime = Math.max(0, base + (t / mDur) * secPerMeasure);

        const tab = Array.isArray(n?.TabPosition) ? n!.TabPosition : [];
        const mids = Array.isArray(n?.Midi) ? n!.Midi : [];
        const hasTieStart = Boolean((n as any)?.TieStart);
        const hasTieStop = Boolean((n as any)?.TieStop);

        for (let i = 0; i < tab.length; i++) {
          const tp = tab[i]!;
          if (!tp || typeof tp.fret !== "number" || typeof tp.str !== "number") continue;
          const midi = typeof mids[i] === "number" ? mids[i] : mids.find((x) => typeof x === "number" && x >= 0);
          const pitch = typeof midi === "number" && midi >= 0 ? midiToPitchName(midi) : null;
          const ev: TabEvent = {
            startTime,
            duration: Math.max(0.01, durSec),
            string: tp.str,
            fret: tp.fret,
          };
          if (typeof midi === "number") ev.midi = midi;
          if (pitch) ev.pitch = pitch;
          const tieKey = `${tp.str}:${tp.fret}:${typeof midi === "number" ? midi : "na"}`;
          const active = activeTies.get(tieKey);

          if (hasTieStop) {
            const merged = active ?? ev;
            const endTime = startTime + Math.max(0.01, durSec);
            merged.duration = Math.max(0.01, endTime - merged.startTime);
            activeTies.set(tieKey, merged);

            if (!hasTieStart) {
              out.push(merged);
              activeTies.delete(tieKey);
            }
            continue;
          }

          if (hasTieStart) {
            activeTies.set(tieKey, ev);
            continue;
          }

          out.push(ev);
        }

        t += durUnits;
      }
    }
  }

  for (const voiceTies of activeTiesByVoice.values()) {
    for (const pending of voiceTies.values()) {
      out.push(pending);
    }
  }

  out.sort((a, b) => a.startTime - b.startTime || a.string - b.string || a.fret - b.fret);
  // De-dupe measure starts (Klang can repeat timestamps).
  measureStarts.sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const t of measureStarts) {
    const last = uniq.length > 0 ? uniq[uniq.length - 1] : null;
    if (last == null || Math.abs(last - t) > 1e-6) uniq.push(t);
  }
  return { tabEvents: out, measureStarts: uniq, tempo, timeSignature };
}
