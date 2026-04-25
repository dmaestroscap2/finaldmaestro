import { describe, expect, it } from "vitest";
import { resolvePracticeVisualElapsed } from "./studentPracticeTimeline.utils";

describe("resolvePracticeVisualElapsed", () => {
  it("uses the live reference audio time when the reference track is playing", () => {
    expect(
      resolvePracticeVisualElapsed({
        isReferencePlaying: true,
        audioCurrentTime: 12.4,
        elapsedSec: 8,
      })
    ).toBe(12.4);
  });

  it("falls back to the session timer when reference playback is not active", () => {
    expect(
      resolvePracticeVisualElapsed({
        isReferencePlaying: false,
        audioCurrentTime: 12.4,
        elapsedSec: 8,
      })
    ).toBe(8);
  });

  it("ignores invalid audio times", () => {
    expect(
      resolvePracticeVisualElapsed({
        isReferencePlaying: true,
        audioCurrentTime: Number.NaN,
        elapsedSec: 5,
      })
    ).toBe(5);
  });
});
