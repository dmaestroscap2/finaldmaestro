import { describe, expect, it } from "vitest";
import { extractPracticeTabData } from "./studentPracticePreview.utils";

describe("extractPracticeTabData", () => {
  it("keeps guitar tab payload from the fetched practice music response", () => {
    const result = extractPracticeTabData(
      {
        sourceUsed: "klang_json",
        tabEvents: [{ startTime: 1, duration: 0.5, string: 2, fret: 3 }],
        tabMeasureStarts: [0, 2],
      },
      "guitar"
    );

    expect(result).toEqual({
      tabEvents: [{ startTime: 1, duration: 0.5, string: 2, fret: 3 }],
      tabMeasureStarts: [0, 2],
    });
  });

  it("drops tab payload for non-guitar practice views", () => {
    const result = extractPracticeTabData(
      {
        sourceUsed: "klang_json",
        tabEvents: [{ startTime: 1, duration: 0.5, string: 2, fret: 3 }],
        tabMeasureStarts: [0, 2],
      },
      "piano"
    );

    expect(result).toEqual({
      tabEvents: [],
      tabMeasureStarts: [],
    });
  });

  it("keeps derived guitar tab payload even when it comes from a fallback source", () => {
    const result = extractPracticeTabData(
      {
        sourceUsed: "stored",
        tabEvents: [{ startTime: 1, duration: 0.5, string: 6, fret: 1 }],
        tabMeasureStarts: [],
      },
      "guitar"
    );

    expect(result).toEqual({
      tabEvents: [{ startTime: 1, duration: 0.5, string: 6, fret: 1 }],
      tabMeasureStarts: [],
    });
  });
});
