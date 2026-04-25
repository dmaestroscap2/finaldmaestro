import { describe, expect, it } from "vitest";
import { computeNoteLaneGlyphs, computeTabLaneGlyphs } from "./musicPreview.utils";

describe("computeTabLaneGlyphs", () => {
  it("places fret numbers on the string lines (textY equals lineY)", () => {
    const res = computeTabLaneGlyphs({
      tabEvents: [
        { startTime: 1, duration: 0.5, string: 1, fret: 0 },
        { startTime: 1, duration: 0.5, string: 6, fret: 3 },
      ],
      measureStarts: [],
      currentTime: 0,
      viewWidth: 1000,
      playheadX: 220,
      pxPerSecond: 120,
      xMargin: 80,
      yTop: 176,
      spacing: 10,
    });

    expect(res.glyphs).toHaveLength(2);
    for (const g of res.glyphs) {
      expect(g.textY).toBe(g.lineY);
    }
    expect(res.glyphs[0]!.lineY).toBe(176);
    expect(res.glyphs[1]!.lineY).toBe(176 + 5 * 10);
  });
});

describe("computeNoteLaneGlyphs", () => {
  it("places accidentals on the same staff position as their natural note", () => {
    const res = computeNoteLaneGlyphs({
      notes: [
        { pitch: "C4", startTime: 1, duration: 0.5 },
        { pitch: "C#4", startTime: 1, duration: 0.5 },
      ],
      currentTime: 0,
      instrument: "piano",
      viewWidth: 1000,
      playheadX: 220,
      pxPerSecond: 120,
      xMargin: 80,
      staffLineYs: [82, 98, 114, 130, 146],
    });

    expect(res).toHaveLength(2);
    expect(res[0]!.y).toBe(res[1]!.y);
    expect(res[0]!.ledgerLineYs).toEqual([162]);
    expect(res[1]!.ledgerLineYs).toEqual([162]);
  });

  it("uses written octave placement for guitar notation", () => {
    const res = computeNoteLaneGlyphs({
      notes: [{ pitch: "C3", startTime: 1, duration: 0.5 }],
      currentTime: 0,
      instrument: "guitar",
      viewWidth: 1000,
      playheadX: 220,
      pxPerSecond: 120,
      xMargin: 80,
      staffLineYs: [82, 98, 114, 130, 146],
    });

    expect(res).toHaveLength(1);
    expect(res[0]!.displayPitch).toBe("C4");
    expect(res[0]!.y).toBe(162);
    expect(res[0]!.ledgerLineYs).toEqual([162]);
  });
});
