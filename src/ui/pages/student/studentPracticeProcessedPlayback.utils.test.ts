import { describe, expect, it } from "vitest";
import {
  buildRemainingPracticeNotes,
  computePracticeMediaElapsed,
  resolvePracticePlaybackSource,
} from "./studentPracticeProcessedPlayback.utils";

describe("studentPracticeProcessedPlayback utils", () => {
  it("prefers synthesized processed playback when practice notes exist", () => {
    expect(resolvePracticePlaybackSource([{ pitch: "C4", startTime: 0, duration: 1 }] as any)).toBe("synth");
    expect(resolvePracticePlaybackSource([])).toBe("none");
  });

  it("computes media elapsed using playback rate instead of wall-clock seconds", () => {
    expect(
      computePracticeMediaElapsed({
        isRunning: true,
        baseMediaSec: 4,
        basePerfMs: 1000,
        nowPerfMs: 3000,
        playbackRate: 1.5,
      })
    ).toBeCloseTo(7, 6);
  });

  it("builds only the remaining processed notes after the current media time", () => {
    const remaining = buildRemainingPracticeNotes(
      [
        { pitch: "C4", startTime: 0, duration: 1 },
        { pitch: "E4", startTime: 2, duration: 1 },
        { pitch: "G4", startTime: 4, duration: 2 },
      ] as any,
      3,
      2
    );

    expect(remaining).toEqual([{ pitch: "G4", offsetSec: 0.5, durationSec: 1 }]);
  });
});
