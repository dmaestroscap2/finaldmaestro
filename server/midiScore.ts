import midiPkg from "@tonejs/midi";
import type { ExtractedNote } from "../shared/schema";
import { midiToPitchName } from "./klangio";

// @tonejs/midi is CommonJS; in Node ESM we need to access it via the default export.
const { Midi } = midiPkg as unknown as { Midi: typeof import("@tonejs/midi").Midi };

function midiToFrequency(midiNumber: number): number {
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

function instrumentToGmProgramHint(inst: string): number[] {
  const i = inst.toLowerCase();
  if (i === "piano" || i === "xylophone") return [0, 4]; // Acoustic Grand, Electric Piano
  if (i === "guitar") return [24, 25, 26, 27, 28, 29, 30, 31];
  if (i === "bass") return [32, 33, 34, 35, 36, 37, 38, 39];
  if (i === "trumpet") return [56, 57, 58, 59];
  if (i === "trombone") return [57, 58];
  if (i === "saxophone") return [64, 65, 66, 67];
  if (i === "clarinet") return [71];
  return [];
}

type MidiRangeHint = { min: number; max: number; center: number };

function instrumentToMidiRangeHint(inst: string): MidiRangeHint | null {
  const i = inst.toLowerCase();
  // These are practical heuristics for track selection, not strict limits.
  // Goal: avoid picking an obviously-wrong track (e.g. bass) when the MIDI
  // file lacks track names/program changes.
  if (i === "guitar") return { min: 40, max: 88, center: 64 }; // E2..E6-ish
  if (i === "bass") return { min: 28, max: 60, center: 40 }; // E1..C4-ish
  if (i === "piano") return { min: 21, max: 108, center: 64 };
  if (i === "xylophone") return { min: 60, max: 108, center: 84 };
  if (i === "trumpet") return { min: 55, max: 90, center: 72 };
  if (i === "trombone") return { min: 40, max: 78, center: 58 };
  if (i === "saxophone") return { min: 49, max: 92, center: 70 };
  if (i === "clarinet") return { min: 50, max: 92, center: 70 };
  return null;
}

function medianMidi(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

export function pickMidiTrackIndex(midi: import("@tonejs/midi").Midi, instrument: string | null | undefined): number {
  const tracks = midi.tracks ?? [];
  if (tracks.length === 0) return -1;

  const inst = String(instrument ?? "").trim().toLowerCase();
  const hints = instrumentToGmProgramHint(inst);
  const rangeHint = inst ? instrumentToMidiRangeHint(inst) : null;

  // 1) Prefer matching program number when present.
  if (hints.length > 0) {
    const idx = tracks.findIndex((t) => typeof t.instrument?.number === "number" && hints.includes(t.instrument.number));
    if (idx >= 0) return idx;
  }

  // 2) Prefer matching name.
  if (inst) {
    const idx = tracks.findIndex((t) => String(t.name ?? "").toLowerCase().includes(inst));
    if (idx >= 0) return idx;
  }

  // 3) If an instrument was requested, score tracks to avoid obvious mismatches.
  //    This is especially important for MIDI-quant where program/name metadata
  //    is often missing, and choosing the wrong track can shift perceived pitch
  //    dramatically (e.g. bass vs guitar).
  if (inst && rangeHint) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i]!;
      const isDrum = (t.channel ?? -1) === 9;
      if (isDrum) continue;
      const notes = Array.isArray(t.notes) ? t.notes : [];
      if (notes.length === 0) continue;

      const midis = notes.map((n) => n.midi).filter((n) => Number.isFinite(n));
      const med = medianMidi(midis);
      if (!Number.isFinite(med)) continue;

      // Hard penalty if the track's median is well outside the expected range.
      const outside = med < rangeHint.min - 2 || med > rangeHint.max + 2;
      const rangePenalty = outside ? 10_000 : 0;

      // Prefer more notes; prefer median close to expected center.
      const distance = Math.abs(med - rangeHint.center);
      const score = notes.length * 10 - distance * 5 - rangePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) return bestIdx;
  }

  // 4) Non-drum track with the most notes.
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const isDrum = (t.channel ?? -1) === 9;
    if (isDrum) continue;
    const c = Array.isArray(t.notes) ? t.notes.length : 0;
    if (c > bestCount) {
      bestCount = c;
      best = i;
    }
  }

  return best;
}

export function midiBytesToExtractedNotesFromTrack(
  midiBytes: Uint8Array,
  trackIndex: number
): { notes: ExtractedNote[]; duration: number; tempo: number } {
  const midi = new Midi(midiBytes);

  const tempo =
    midi.header.tempos?.[0]?.bpm && Number.isFinite(midi.header.tempos[0].bpm)
      ? midi.header.tempos[0].bpm
      : 120;

  const track = midi.tracks?.[trackIndex];
  const notes: ExtractedNote[] = track
    ? track.notes.map((n) => ({
        pitch: midiToPitchName(n.midi),
        frequency: midiToFrequency(n.midi),
        startTime: n.time,
        duration: n.duration,
        velocity: n.velocity,
        confidence: Math.max(0, Math.min(1, n.velocity)),
      }))
    : [];

  return {
    notes,
    duration: midi.duration ?? Math.max(0, ...notes.map((n) => n.startTime + n.duration)),
    tempo,
  };
}

export function midiBytesToExtractedNotesForInstrument(
  midiBytes: Uint8Array,
  instrument: string | null | undefined
): { notes: ExtractedNote[]; duration: number; tempo: number; trackIndex: number } {
  const midi = new Midi(midiBytes);
  const trackIndex = pickMidiTrackIndex(midi, instrument);
  const { notes, duration, tempo } = midiBytesToExtractedNotesFromTrack(midiBytes, trackIndex);
  return { notes, duration, tempo, trackIndex };
}
