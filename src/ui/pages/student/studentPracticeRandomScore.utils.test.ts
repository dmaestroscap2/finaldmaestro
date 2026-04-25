import { describe, expect, it } from "vitest";
import {
  applyRandomScoreOnPitch,
  DEFAULT_RANDOM_SCORE_CONFIG,
  DEFAULT_RANDOM_SCORE_STATE,
} from "./studentPracticeRandomScore.utils";

describe("studentPracticeRandomScore utils", () => {
  it("does nothing when disabled", () => {
    const out = applyRandomScoreOnPitch({
      state: DEFAULT_RANDOM_SCORE_STATE,
      detectedPitch: "C4",
      nowMs: 1000,
      config: { ...DEFAULT_RANDOM_SCORE_CONFIG, enabled: false },
      rng: () => 0.5,
    });
    expect(out).toEqual(DEFAULT_RANDOM_SCORE_STATE);
  });

  it("awards points when enabled and a pitch is detected", () => {
    const out = applyRandomScoreOnPitch({
      state: DEFAULT_RANDOM_SCORE_STATE,
      detectedPitch: "C4",
      nowMs: 1000,
      config: { ...DEFAULT_RANDOM_SCORE_CONFIG, enabled: true, minPoints: 3, maxPoints: 12 },
      rng: () => 0, // min
    });
    expect(out.points).toBe(3);
    expect(out.lastAwardedPitch).toBe("C4");
  });

  it("debounces repeated awards for the same pitch", () => {
    const cfg = { ...DEFAULT_RANDOM_SCORE_CONFIG, enabled: true, debounceMs: 500, minPoints: 1, maxPoints: 1 };
    const first = applyRandomScoreOnPitch({
      state: DEFAULT_RANDOM_SCORE_STATE,
      detectedPitch: "A4",
      nowMs: 1000,
      config: cfg,
      rng: () => 0.5,
    });
    const second = applyRandomScoreOnPitch({
      state: first,
      detectedPitch: "A4",
      nowMs: 1200,
      config: cfg,
      rng: () => 0.5,
    });
    const third = applyRandomScoreOnPitch({
      state: first,
      detectedPitch: "A4",
      nowMs: 1600,
      config: cfg,
      rng: () => 0.5,
    });

    expect(first.points).toBe(1);
    expect(second.points).toBe(1);
    expect(third.points).toBe(2);
  });

  it("does not debounce when the detected pitch changes", () => {
    const cfg = { ...DEFAULT_RANDOM_SCORE_CONFIG, enabled: true, debounceMs: 10_000, minPoints: 1, maxPoints: 1 };
    const first = applyRandomScoreOnPitch({
      state: DEFAULT_RANDOM_SCORE_STATE,
      detectedPitch: "C4",
      nowMs: 1000,
      config: cfg,
      rng: () => 0.5,
    });
    const second = applyRandomScoreOnPitch({
      state: first,
      detectedPitch: "D4",
      nowMs: 1200,
      config: cfg,
      rng: () => 0.5,
    });
    expect(second.points).toBe(2);
  });
});

