import { describe, expect, it } from "vitest";
import { klangioJsonToExtractedNotes, pickKlangioPartNameForInstrument } from "./klangioScore";

describe("klangioScore utils", () => {
  it("picks an instrument-appropriate part name", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        { Name: "Piano", Program: 0 },
        { Name: "Guitar", Tab: true, Program: 24 },
        { Name: "A. Sax.", Program: 65 },
        { Name: "Clarinet", Program: 71 },
        { Name: "Trumpet", Program: 56 },
        { Name: "Trombone", Program: 57 },
        { Name: "Xylophone", Program: 13 },
        { Name: "Drums", IsDrum: true },
      ],
    };

    expect(pickKlangioPartNameForInstrument(score as any, "piano")).toBe("Piano");
    expect(pickKlangioPartNameForInstrument(score as any, "guitar")).toBe("Guitar");
    expect(pickKlangioPartNameForInstrument(score as any, "saxophone")).toBe("A. Sax.");
    expect(pickKlangioPartNameForInstrument(score as any, "clarinet")).toBe("Clarinet");
    expect(pickKlangioPartNameForInstrument(score as any, "trumpet")).toBe("Trumpet");
    expect(pickKlangioPartNameForInstrument(score as any, "trombone")).toBe("Trombone");
    expect(pickKlangioPartNameForInstrument(score as any, "xylophone")).toBe("Xylophone");
  });

  it("prefers tab-enabled guitar parts when multiple candidates exist", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        { Name: "Guitar", Tab: false, Program: 24 },
        { Name: "Guitar (Tab)", Tab: true, Program: 24 },
        { Name: "Drums", IsDrum: true },
      ],
    };

    expect(pickKlangioPartNameForInstrument(score as any, "guitar")).toBe("Guitar (Tab)");
  });

  it("avoids drum parts when selecting a melodic instrument", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [{ Name: "Drums", IsDrum: true }, { Name: "Piano", Program: 0 }],
    };

    expect(pickKlangioPartNameForInstrument(score as any, "piano")).toBe("Piano");
  });

  it("falls back to generic wind/brass parts when specific instrument names are absent", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        { Name: "Piano", Program: 0 },
        { Name: "Wind", Program: 64 },
        { Name: "Brass", Program: 56 },
      ],
    };

    expect(pickKlangioPartNameForInstrument(score as any, "clarinet")).toBe("Wind");
    expect(pickKlangioPartNameForInstrument(score as any, "saxophone")).toBe("Wind");
    expect(pickKlangioPartNameForInstrument(score as any, "trumpet")).toBe("Brass");
    expect(pickKlangioPartNameForInstrument(score as any, "trombone")).toBe("Brass");
  });

  it("converts Klangio JSON to ExtractedNote[] with seconds timing", () => {
    // One measure at timestamp 1.0s, 4/4 @120bpm => 2.0s per measure.
    // Note duration 0.25 of measure => 0.5s.
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        {
          Name: "Piano",
          Measures: [
            {
              TimeStamp: 1.0,
              Voices: [
                {
                  Notes: [
                    { Midi: [60], Duration: 0.25, Velocity: 100 },
                    { Midi: [62], Duration: 0.25, Velocity: 100 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { notes } = klangioJsonToExtractedNotes(score as any, "Piano");
    expect(notes).toHaveLength(2);
    expect(notes[0]?.pitch).toBe("C4");
    expect(notes[0]?.startTime).toBeCloseTo(1.0, 6);
    expect(notes[0]?.duration).toBeCloseTo(0.5, 6);
    expect(notes[1]?.pitch).toBe("D4");
    expect(notes[1]?.startTime).toBeCloseTo(1.5, 6);
  });

  it("merges tied Klangio notes into one continuous extracted note", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        {
          Name: "Piano",
          Measures: [
            {
              TimeStamp: 0,
              Voices: [
                {
                  Notes: [
                    { Midi: [60], Duration: 0.25, Velocity: 100, TieStart: true, TieStop: false },
                    { Midi: [60], Duration: 0.25, Velocity: 100, TieStart: false, TieStop: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { notes } = klangioJsonToExtractedNotes(score as any, "Piano");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.pitch).toBe("C4");
    expect(notes[0]?.startTime).toBeCloseTo(0, 6);
    expect(notes[0]?.duration).toBeCloseTo(1.0, 6);
  });
});
