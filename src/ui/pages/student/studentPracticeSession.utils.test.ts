import { describe, expect, it } from "vitest";
import {
  advanceMissedNotes,
  evaluateDetectedPracticeFrame,
  getExpectedNoteIndex,
  pitchesMatch,
  summarisePracticeStatuses,
  DEFAULT_PRACTICE_SCORING_CONFIG,
} from "./studentPracticeSession.utils";

describe("studentPracticeSession utils", () => {
  it("finds the currently expected note within a tolerance window", () => {
    const notes = [
      { pitch: "C4", startTime: 0, duration: 0.5 },
      { pitch: "D4", startTime: 1, duration: 0.5 },
    ];

    expect(getExpectedNoteIndex(notes, 0.1)).toBe(0);
    expect(getExpectedNoteIndex(notes, 1.1)).toBe(1);
    expect(getExpectedNoteIndex(notes, 2.0)).toBe(-1);
  });

  it("matches played pitch by actual MIDI identity", () => {
    expect(pitchesMatch("C#4", "Db4")).toBe(true);
    expect(pitchesMatch("C4", "B3")).toBe(true);
    expect(pitchesMatch("C4", "C#4")).toBe(true);
    expect(pitchesMatch("C4", "D4")).toBe(false);
    expect(pitchesMatch("C4", null)).toBe(false);
  });

  it("marks overdue pending notes as missed", () => {
    const notes = [
      { pitch: "C4", startTime: 0, duration: 0.5 },
      { pitch: "D4", startTime: 1, duration: 0.5 },
    ];

    expect(advanceMissedNotes(notes, ["pending", "pending"], 0.4)).toEqual(["pending", "pending"]);
    expect(advanceMissedNotes(notes, ["pending", "pending"], 0.8)).toEqual(["missed", "pending"]);
  });

  it("summarises note statuses for live/final metrics", () => {
    expect(summarisePracticeStatuses(["correct", "pending", "missed", "correct"])).toEqual({
      totalNotes: 4,
      correctNotes: 2,
      incorrectNotes: 0,
      missedNotes: 1,
      pendingNotes: 1,
    });
  });

  it("grades an on-time matching note as perfect", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 1.03,
        playedPitch: "C4",
        frameDurationSec: 0.12,
      })
    ).toEqual({
      statuses: ["correct"],
      timingGrades: ["perfect"],
      heldDurations: [0.12],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("marks early and late hits with their timing grade while still accepting the note", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.88,
        playedPitch: "C4",
        frameDurationSec: 0.1,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["early"],
      matchedIndex: 0,
      wrongHit: false,
    });

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 1.16,
        playedPitch: "C4",
        frameDurationSec: 0.1,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["late"],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("accepts a near-note pitch when the player is within one semitone", () => {
    const notes = [{ pitch: "E4", startTime: 0.5, duration: 0.5 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.54,
        playedPitch: "F4",
        frameDurationSec: 0.12,
      })
    ).toEqual({
      statuses: ["correct"],
      timingGrades: ["perfect"],
      heldDurations: [0.12],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("allows overriding pitch tolerance for strict scoring", () => {
    const notes = [{ pitch: "E4", startTime: 0.5, duration: 0.5 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.54,
        playedPitch: "F4",
        frameDurationSec: 0.12,
        config: { ...DEFAULT_PRACTICE_SCORING_CONFIG, pitchToleranceSemitones: 0 },
      })
	    ).toMatchObject({
	      statuses: ["incorrect"],
	      wrongHit: true,
	    });
	  });

  it("grades slightly-outside timing windows as early/late when within the note window", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.65,
        playedPitch: "C4",
        frameDurationSec: 0.12,
        config: {
          ...DEFAULT_PRACTICE_SCORING_CONFIG,
          earlyWindowSec: 0.2,
          lateWindowSec: 0.2,
          noteWindowSec: 0.4,
        },
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["early"],
      wrongHit: false,
    });

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 1.95,
        playedPitch: "C4",
        frameDurationSec: 0.12,
        config: {
          ...DEFAULT_PRACTICE_SCORING_CONFIG,
          earlyWindowSec: 0.2,
          lateWindowSec: 0.2,
          noteWindowSec: 0.4,
        },
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["late"],
      wrongHit: false,
    });
  });

  it("accepts slightly earlier hits instead of treating them as outside the timing window", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.84,
        playedPitch: "C4",
        frameDurationSec: 0.12,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["early"],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("accepts moderately early hits as acceptable timing instead of dropping them", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.78,
        playedPitch: "C4",
        frameDurationSec: 0.12,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["early"],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("accepts moderately late hits as acceptable timing instead of treating them as missed", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 0.8 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 1.28,
        playedPitch: "C4",
        frameDurationSec: 0.12,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["late"],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("counts a correct pitch played mid-note as a hit (not just near the onset)", () => {
    const notes = [{ pitch: "C4", startTime: 1, duration: 1.2 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 1.8,
        playedPitch: "C4",
        frameDurationSec: 0.12,
      })
    ).toMatchObject({
      statuses: ["correct"],
      timingGrades: ["perfect"],
      wrongHit: false,
    });
  });

  it("matches the best pending note in an overlapping chord instead of flagging a wrong hit", () => {
    const notes = [
      { pitch: "C4", startTime: 1, duration: 0.8 },
      { pitch: "E4", startTime: 1, duration: 0.8 },
    ];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending", "pending"],
        timingGrades: [null, null],
        heldDurations: [0, 0],
        currentTime: 1.02,
        playedPitch: "E4",
        frameDurationSec: 0.12,
      })
    ).toMatchObject({
      statuses: ["pending", "correct"],
      timingGrades: [null, "perfect"],
      wrongHit: false,
      matchedIndex: 1,
    });
  });

  it("does not count a very short held note as correct yet", () => {
    const notes = [{ pitch: "G4", startTime: 2, duration: 2.5 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 2.02,
        playedPitch: "G4",
        frameDurationSec: 0.1,
      })
    ).toEqual({
      statuses: ["pending"],
      timingGrades: ["perfect"],
      heldDurations: [0.1],
      matchedIndex: 0,
      wrongHit: false,
    });
  });

  it("flags a wrong hit when the played pitch does not match the active note", () => {
    const notes = [{ pitch: "E4", startTime: 0.5, duration: 0.5 }];

    expect(
      evaluateDetectedPracticeFrame({
        notes,
        statuses: ["pending"],
        timingGrades: [null],
        heldDurations: [0],
        currentTime: 0.52,
        playedPitch: "G4",
        frameDurationSec: 0.1,
      })
	    ).toEqual({
	      statuses: ["incorrect"],
	      timingGrades: [null],
	      heldDurations: [0],
	      matchedIndex: 0,
	      wrongHit: true,
	    });
	  });
});
