import { describe, expect, it } from "vitest";
import midiPkg from "@tonejs/midi";
import { pickMidiTrackIndex } from "./midiScore";

// @tonejs/midi is CommonJS; in Node ESM we need to access it via the default export.
const { Midi } = midiPkg as unknown as { Midi: typeof import("@tonejs/midi").Midi };

function makeMidiBytesWithTwoTracks(opts: {
  bassMidis: number[];
  guitarMidis: number[];
  bassFirst?: boolean;
}): Uint8Array {
  const midi = new Midi();
  const bass = midi.addTrack();
  const guitar = midi.addTrack();

  const tBass = opts.bassFirst ? bass : guitar;
  const tGuitar = opts.bassFirst ? guitar : bass;

  // Intentionally do not set track names or program changes. This mirrors
  // the problematic case where track selection falls back to a naive heuristic.
  opts.bassMidis.forEach((m, idx) => {
    tBass.addNote({ midi: m, time: idx * 0.5, duration: 0.25, velocity: 0.8 });
  });
  opts.guitarMidis.forEach((m, idx) => {
    tGuitar.addNote({ midi: m, time: idx * 0.5, duration: 0.25, velocity: 0.8 });
  });

  return new Uint8Array(midi.toArray());
}

describe("pickMidiTrackIndex", () => {
  it("prefers the guitar-range track over a bass-range track when instrument=guitar (no names/programs)", () => {
    const bytes = makeMidiBytesWithTwoTracks({
      bassMidis: [33, 35, 38, 40, 43, 45], // E1..A2-ish
      guitarMidis: [52, 55, 59, 64, 67, 71], // E3..B4-ish
      bassFirst: true, // bass track is index 0, guitar track is index 1
    });

    const midi = new Midi(bytes);
    expect(pickMidiTrackIndex(midi, "guitar")).toBe(1);
  });

  it("falls back to the non-drum track with the most notes when instrument is not provided", () => {
    const midi = new Midi();
    const t0 = midi.addTrack();
    const t1 = midi.addTrack();
    t0.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    t1
      .addNote({ midi: 64, time: 0, duration: 0.5, velocity: 0.8 })
      .addNote({ midi: 67, time: 1, duration: 0.5, velocity: 0.8 });

    const parsed = new Midi(new Uint8Array(midi.toArray()));
    expect(pickMidiTrackIndex(parsed, null)).toBe(1);
  });
});

