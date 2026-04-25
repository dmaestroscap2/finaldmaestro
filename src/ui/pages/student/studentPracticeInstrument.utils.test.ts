import { describe, expect, it } from "vitest";
import { resolveStudentPracticeInstrument } from "./studentPracticeInstrument.utils";

describe("resolveStudentPracticeInstrument", () => {
  it("uses the saved student instrument when present", () => {
    expect(resolveStudentPracticeInstrument("piano", "guitar")).toBe("guitar");
    expect(resolveStudentPracticeInstrument(null, "saxophone")).toBe("saxophone");
  });

  it("falls back to the query instrument when the user instrument is missing", () => {
    expect(resolveStudentPracticeInstrument("clarinet", null)).toBe("clarinet");
  });

  it("defaults to piano only when neither source provides an instrument", () => {
    expect(resolveStudentPracticeInstrument(null, null)).toBe("piano");
    expect(resolveStudentPracticeInstrument("", "")).toBe("piano");
  });
});
