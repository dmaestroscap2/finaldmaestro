import { describe, expect, it } from "vitest";
import { formatPracticeMusicalLabel } from "./studentPracticeLabel.utils";

describe("formatPracticeMusicalLabel", () => {
  it("keeps digits for guitar labels", () => {
    expect(formatPracticeMusicalLabel("C4", "guitar")).toBe("C4");
    expect(formatPracticeMusicalLabel("Bm7", "guitar")).toBe("Bm7");
  });

  it("strips octave numbers for non-guitar pitch labels", () => {
    expect(formatPracticeMusicalLabel("C4", "piano")).toBe("C");
    expect(formatPracticeMusicalLabel("C#4", "trumpet")).toBe("C#");
    expect(formatPracticeMusicalLabel("Bb3", "clarinet")).toBe("Bb");
  });

  it("converts chord digits to words for non-guitar instruments", () => {
    expect(formatPracticeMusicalLabel("Bm7", "piano")).toBe("Bm seven");
    expect(formatPracticeMusicalLabel("Cmaj9", "saxophone")).toBe("Cmaj nine");
  });

  it("returns empty string for empty inputs", () => {
    expect(formatPracticeMusicalLabel("", "piano")).toBe("");
    expect(formatPracticeMusicalLabel(null, "piano")).toBe("");
  });

  it("never outputs digits for non-guitar instruments", () => {
    const out = formatPracticeMusicalLabel("C#4", "piano");
    expect(/\d/.test(out)).toBe(false);
  });
});

