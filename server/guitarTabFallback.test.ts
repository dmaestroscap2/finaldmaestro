import { describe, expect, it } from "vitest";
import { deriveGuitarTabEventsFromNotes } from "./guitarTabFallback";

describe("deriveGuitarTabEventsFromNotes", () => {
  it("derives standard-tuning fret numbers from note pitches", () => {
    const events = deriveGuitarTabEventsFromNotes([
      { pitch: "F2", frequency: 87.31, startTime: 1, duration: 0.5, velocity: 0.8, confidence: 0.8 },
      { pitch: "C3", frequency: 130.81, startTime: 1.5, duration: 0.5, velocity: 0.8, confidence: 0.8 },
      { pitch: "F3", frequency: 174.61, startTime: 2, duration: 0.5, velocity: 0.8, confidence: 0.8 },
    ]);

    expect(events).toEqual([
      expect.objectContaining({ pitch: "F2", string: 6, fret: 1, startTime: 1 }),
      expect.objectContaining({ pitch: "C3", string: 5, fret: 3, startTime: 1.5 }),
      expect.objectContaining({ pitch: "F3", string: 4, fret: 3, startTime: 2 }),
    ]);
  });

  it("prefers open or lower-fret positions when multiple strings are possible", () => {
    const events = deriveGuitarTabEventsFromNotes([
      { pitch: "E4", frequency: 329.63, startTime: 0, duration: 0.25, velocity: 0.8, confidence: 0.8 },
      { pitch: "B3", frequency: 246.94, startTime: 0.25, duration: 0.25, velocity: 0.8, confidence: 0.8 },
    ]);

    expect(events[0]).toMatchObject({ string: 1, fret: 0 });
    expect(events[1]).toMatchObject({ string: 2, fret: 0 });
  });

  it("skips notes outside the 24-fret standard guitar range", () => {
    const events = deriveGuitarTabEventsFromNotes([
      { pitch: "C1", frequency: 32.7, startTime: 0, duration: 0.5, velocity: 0.8, confidence: 0.8 },
      { pitch: "C7", frequency: 2093, startTime: 1, duration: 0.5, velocity: 0.8, confidence: 0.8 },
      { pitch: "E2", frequency: 82.41, startTime: 2, duration: 0.5, velocity: 0.8, confidence: 0.8 },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ pitch: "E2", string: 6, fret: 0 });
  });
});
