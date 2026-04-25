import type { ExtractedNote } from "../shared/schema";

type KlangioScoreJson = {
  MusicInfo?: {
    Tempo?: number;
    TimeSignature?: string; // "4/4"
    MeasureDuration?: number; // usually 1.0
  };
  Parts?: Array<{
    Name?: string;
    Program?: number;
    IsDrum?: boolean;
    Tab?: boolean;
    Measures?: Array<{
      TimeStamp?: number; // seconds
      MeasureDuration?: number;
      Voices?: Array<{
        Staff?: number;
        Notes?: Array<{
          Midi?: number[];
          Duration?: number; // fraction of measure duration
          Velocity?: number; // 0..127-ish
          TieStart?: boolean;
          TieStop?: boolean;
        }>;
      }>;
    }>;
  }>;
};

function midiToPitchName(midiNumber: number): string {
  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
  const pitchClass = pitchClasses[((midiNumber % 12) + 12) % 12]!;
  const octave = Math.floor(midiNumber / 12) - 1;
  return `${pitchClass}${octave}`;
}

function midiToFrequency(midiNumber: number): number {
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
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
  // Tempo is treated as quarter-note BPM. Adjust beat length based on denominator.
  const beatSeconds = (60 / tempo) * (4 / den);
  return num * beatSeconds;
}

export function listKlangioParts(score: KlangioScoreJson): Array<{ name: string; program?: number; tab?: boolean; isDrum?: boolean }> {
  const parts = Array.isArray(score?.Parts) ? score.Parts : [];
  return parts
    .map((p) => {
      const out: { name: string; program?: number; tab?: boolean; isDrum?: boolean } = {
        name: String(p?.Name ?? "").trim() || "Unknown",
      };
      if (typeof p?.Program === "number") out.program = p.Program;
      if (typeof p?.Tab === "boolean") out.tab = p.Tab;
      if (typeof p?.IsDrum === "boolean") out.isDrum = p.IsDrum;
      return out;
    })
    .filter((p) => p.name.length > 0);
}

export function pickKlangioPartNameForInstrument(score: KlangioScoreJson, instrument: string | null | undefined): string | null {
  const inst = String(instrument ?? "").trim().toLowerCase();
  const parts = listKlangioParts(score);
  if (parts.length === 0) return null;

  const allParts = parts.map((p, idx) => ({ ...p, _idx: idx, _lower: p.name.toLowerCase() }));
  const nonDrumParts = allParts.filter((p) => !p.isDrum);
  const pool = nonDrumParts.length > 0 ? nonDrumParts : allParts;

  const byName = (needle: string) => pool.find((p) => p._lower === needle) ?? null;
  const byIncludes = (needle: string) => pool.find((p) => p._lower.includes(needle)) ?? null;
  const byAnyIncludes = (needles: string[]) =>
    pool.find((p) => needles.some((needle) => p._lower.includes(needle))) ?? null;

  // Klangio "Program" appears to follow General MIDI program numbering (0..127). Use ranges as hints.
  const programIs = (p: { program?: number }, wanted: number | number[]) => {
    if (typeof p.program !== "number" || !Number.isFinite(p.program)) return false;
    const list = Array.isArray(wanted) ? wanted : [wanted];
    return list.includes(p.program);
  };
  const programIn = (p: { program?: number }, min: number, max: number) => {
    if (typeof p.program !== "number" || !Number.isFinite(p.program)) return false;
    const v = p.program;
    return v >= min && v <= max;
  };

  const pickBest = (candidates: typeof pool, scoreFn: (p: (typeof pool)[number]) => number) => {
    let best: (typeof pool)[number] | null = null;
    let bestScore = -Infinity;
    for (const p of candidates) {
      const s = scoreFn(p);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    return best;
  };

  if (inst === "piano") return byName("piano")?.name ?? byIncludes("piano")?.name ?? pool[0]!.name;
  if (inst === "guitar") {
    const best = pickBest(pool, (p) => {
      let s = 0;
      if (p.tab) s += 1000;
      if (p._lower.includes("guitar") || p._lower.includes("gtr")) s += 500;
      if (programIn(p, 24, 31)) s += 250; // guitars
      if (p._lower.includes("acoustic")) s += 40;
      if (p._lower.includes("electric")) s += 30;
      return s;
    });
    return best?.name ?? pool[0]!.name;
  }

  if (inst === "xylophone") {
    const best = pickBest(pool, (p) => {
      let s = 0;
      if (p._lower.includes("xylophone")) s += 1000;
      if (programIs(p, [13, 14])) s += 700; // GM: xylophone (0-based/1-based drift)
      if (p._lower.includes("glock")) s += 200;
      if (p._lower.includes("mallet")) s += 120;
      if (programIn(p, 8, 15)) s += 80; // chromatic percussion neighborhood
      if (p._lower.includes("piano")) s -= 200;
      return s;
    });
    return best?.name ?? byName("piano")?.name ?? byIncludes("synth")?.name ?? pool[0]!.name;
  }

  // Winds/brass: prefer exact or alias matches, else melody-leading parts.
  const aliases: Record<string, string[]> = {
    saxophone: ["saxophone", "a. sax", "alto sax", "tenor sax", "sax"],
    clarinet: ["clarinet", "cl.", "clari"],
    trumpet: ["trumpet", "tpt", "trp"],
    trombone: ["trombone", "tbn", "bone"],
  };
  if (inst in aliases) {
    const exact = byName(inst);
    if (exact) return exact.name;

    const best = pickBest(pool, (p) => {
      let s = 0;
      if (aliases[inst]!.some((needle) => p._lower.includes(needle))) s += 1000;
      if (inst === "saxophone") {
        if (programIn(p, 64, 67)) s += 800;
        if (programIn(p, 64, 79)) s += 250; // generic woodwinds
        if (p._lower.includes("wind") || p._lower.includes("woodwind")) s += 220;
        if (p._lower.includes("alto")) s += 50;
        if (p._lower.includes("tenor")) s += 40;
      }
      if (inst === "clarinet") {
        if (programIs(p, 71) || programIs(p, 72)) s += 800;
        if (programIn(p, 64, 79)) s += 250; // woodwind family
        if (p._lower.includes("wind") || p._lower.includes("woodwind")) s += 220;
      }
      if (inst === "trumpet") {
        if (programIn(p, 56, 59)) s += 800;
        if (programIn(p, 56, 63)) s += 250; // brass family
        if (p._lower.includes("brass")) s += 220;
        if (p._lower.includes("wind")) s += 120;
      }
      if (inst === "trombone") {
        if (programIn(p, 57, 58)) s += 800;
        if (programIn(p, 56, 63)) s += 250; // brass family
        if (p._lower.includes("brass")) s += 220;
        if (p._lower.includes("wind")) s += 120;
      }
      if (p._lower.includes("vocal")) s -= 400;
      if (p._lower.includes("synth")) s -= 80;
      if (p._lower.includes("lead") || p._lower.includes("melody")) s += 30;
      return s;
    });

    if (best && bestScoreSanity(best, inst)) return best.name;

    // Fallbacks when scoring yields low-confidence picks.
    const inc = byAnyIncludes(aliases[inst]!);
    if (inc) return inc.name;
    const vocals = byIncludes("vocal");
    if (vocals) return vocals.name;
    const wind = byAnyIncludes(["wind", "lead", "melody"]);
    if (wind) return wind.name;
    const synth = byIncludes("synth");
    if (synth) return synth.name;
  }

  const nonDrum = pool.find((p) => !p.isDrum)?.name ?? null;
  return nonDrum ?? pool[0]!.name;
}

function bestScoreSanity(part: { name: string; program?: number; tab?: boolean; isDrum?: boolean }, inst: string): boolean {
  // Basic guardrail: avoid picking an obviously wrong part when we didn't match anything meaningful.
  const lower = String(part.name ?? "").toLowerCase();
  if (!lower) return false;
  if (part.isDrum) return false;
  if (inst === "guitar") return part.tab || lower.includes("guitar") || lower.includes("gtr") || (typeof part.program === "number" && part.program >= 24 && part.program <= 31);
  if (inst === "piano") return lower.includes("piano") || (typeof part.program === "number" && part.program >= 0 && part.program <= 7);
  if (inst === "xylophone") return lower.includes("xylophone") || (typeof part.program === "number" && part.program >= 8 && part.program <= 15);
  if (inst === "saxophone") {
    return (
      lower.includes("sax") ||
      (typeof part.program === "number" && part.program >= 64 && part.program <= 67) ||
      ((lower.includes("wind") || lower.includes("woodwind")) && typeof part.program === "number" && part.program >= 64 && part.program <= 79)
    );
  }
  if (inst === "clarinet") {
    return (
      lower.includes("clar") ||
      part.program === 71 ||
      part.program === 72 ||
      ((lower.includes("wind") || lower.includes("woodwind")) && typeof part.program === "number" && part.program >= 64 && part.program <= 79)
    );
  }
  if (inst === "trumpet") {
    return (
      lower.includes("trump") ||
      (typeof part.program === "number" && part.program >= 56 && part.program <= 59) ||
      ((lower.includes("brass") || lower.includes("wind")) && typeof part.program === "number" && part.program >= 56 && part.program <= 63) ||
      (lower.includes("wind") && typeof part.program === "number" && part.program >= 64 && part.program <= 79)
    );
  }
  if (inst === "trombone") {
    return (
      lower.includes("trombone") ||
      lower.includes("tbn") ||
      (typeof part.program === "number" && part.program >= 57 && part.program <= 58) ||
      ((lower.includes("brass") || lower.includes("wind")) && typeof part.program === "number" && part.program >= 56 && part.program <= 63) ||
      (lower.includes("wind") && typeof part.program === "number" && part.program >= 64 && part.program <= 79)
    );
  }
  return true;
}

export function klangioJsonToExtractedNotes(score: KlangioScoreJson, partName: string | null): {
  notes: ExtractedNote[];
  tempo: number;
  timeSignature: string;
} {
  const tempo = Number.isFinite(score?.MusicInfo?.Tempo) ? Number(score.MusicInfo!.Tempo) : 120;
  const timeSignature = String(score?.MusicInfo?.TimeSignature ?? "4/4");
  const mDurDefault = typeof score?.MusicInfo?.MeasureDuration === "number" && score.MusicInfo!.MeasureDuration! > 0 ? score.MusicInfo!.MeasureDuration! : 1;
  const secPerMeasure = measureSeconds({ tempo, timeSignature });

  const parts = Array.isArray(score?.Parts) ? score.Parts : [];
  const part =
    partName != null
      ? parts.find((p) => String(p?.Name ?? "").trim().toLowerCase() === String(partName).trim().toLowerCase())
      : parts[0];

  const measures = Array.isArray(part?.Measures) ? part!.Measures : [];
  const out: ExtractedNote[] = [];
  const activeTiesByVoice = new Map<number, Map<string, ExtractedNote>>();

  for (const measure of measures) {
    const base = typeof measure?.TimeStamp === "number" && Number.isFinite(measure.TimeStamp) ? measure.TimeStamp : 0;
    const mDur =
      typeof measure?.MeasureDuration === "number" && Number.isFinite(measure.MeasureDuration) && measure.MeasureDuration > 0
        ? measure.MeasureDuration
        : mDurDefault;

    const voices = Array.isArray(measure?.Voices) ? measure!.Voices : [];
    for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex++) {
      const voice = voices[voiceIndex]!;
      const notes = Array.isArray(voice?.Notes) ? voice!.Notes : [];
      let t = 0;
      const activeTies = activeTiesByVoice.get(voiceIndex) ?? new Map<string, ExtractedNote>();
      activeTiesByVoice.set(voiceIndex, activeTies);

      for (const n of notes) {
        const durUnits = typeof n?.Duration === "number" && Number.isFinite(n.Duration) ? n.Duration : 0;
        const durSec = Math.max(0, (durUnits / mDur) * secPerMeasure);
        const startTime = Math.max(0, base + (t / mDur) * secPerMeasure);

        const mids = Array.isArray(n?.Midi) ? n!.Midi : [];
        const velRaw = typeof n?.Velocity === "number" && Number.isFinite(n.Velocity) ? n.Velocity : 80;
        const velocity = Math.max(0, Math.min(1, velRaw / 127));
        const hasTieStart = Boolean((n as any)?.TieStart);
        const hasTieStop = Boolean((n as any)?.TieStop);

        for (const midi of mids) {
          if (typeof midi !== "number" || midi < 0) continue; // -1 is rest
          const current: ExtractedNote = {
            pitch: midiToPitchName(midi),
            frequency: midiToFrequency(midi),
            startTime,
            duration: Math.max(0.01, durSec),
            velocity,
            confidence: velocity,
          };
          const tieKey = `${voiceIndex}:${midi}`;
          const active = activeTies.get(tieKey);

          if (hasTieStop) {
            const merged = active ?? current;
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
            activeTies.set(tieKey, current);
            continue;
          }

          out.push(current);
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

  // Sort for stable UI rendering
  out.sort((a, b) => a.startTime - b.startTime || a.frequency - b.frequency);
  return { notes: out, tempo, timeSignature };
}
