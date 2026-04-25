import { describe, expect, it } from "vitest";
import {
  applyPracticePlaybackRate,
  clampPracticePlaybackRate,
  DEFAULT_PRACTICE_PLAYBACK_RATE,
  formatPracticePlaybackRate,
  MAX_PRACTICE_PLAYBACK_RATE,
  MIN_PRACTICE_PLAYBACK_RATE,
} from "./studentPracticePlayback.utils";

describe("studentPracticePlayback utils", () => {
  it("clamps playback speed to the supported practice range", () => {
    expect(clampPracticePlaybackRate(0.25)).toBe(MIN_PRACTICE_PLAYBACK_RATE);
    expect(clampPracticePlaybackRate(1)).toBe(1);
    expect(clampPracticePlaybackRate(2.5)).toBe(MAX_PRACTICE_PLAYBACK_RATE);
  });

  it("falls back to the default speed when given an invalid value", () => {
    expect(clampPracticePlaybackRate(Number.NaN)).toBe(DEFAULT_PRACTICE_PLAYBACK_RATE);
    expect(clampPracticePlaybackRate(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PRACTICE_PLAYBACK_RATE);
  });

  it("formats the speed label consistently for the slider UI", () => {
    expect(formatPracticePlaybackRate(0.5)).toBe("0.5x");
    expect(formatPracticePlaybackRate(1)).toBe("1.0x");
    expect(formatPracticePlaybackRate(1.46)).toBe("1.5x");
  });

  it("applies the playback speed directly to the audio element for live updates", () => {
    const audio = {
      playbackRate: 1,
      defaultPlaybackRate: 1,
      preservesPitch: true,
      mozPreservesPitch: true,
      webkitPreservesPitch: true,
    };

    const applied = applyPracticePlaybackRate(audio, 1.7);

    expect(applied).toBe(1.7);
    expect(audio.playbackRate).toBe(1.7);
    expect(audio.defaultPlaybackRate).toBe(1.7);
    expect(audio.preservesPitch).toBe(false);
    expect(audio.mozPreservesPitch).toBe(false);
    expect(audio.webkitPreservesPitch).toBe(false);
  });
});
