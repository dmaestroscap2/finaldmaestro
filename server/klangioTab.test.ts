import { describe, expect, it } from "vitest";
import { klangioJsonToTabEvents } from "./klangioTab";

describe("klangioTab", () => {
  it("extracts TabPosition events with seconds timing", () => {
    const score = {
      MusicInfo: { Tempo: 120, TimeSignature: "4/4", MeasureDuration: 1 },
      Parts: [
        {
          Name: "Guitar",
          Tab: true,
          Measures: [
            {
              TimeStamp: 1.0,
              Voices: [
                {
                  Notes: [
                    { Midi: [41], Duration: 0.25, TabPosition: [{ fret: 1, str: 6 }] },
                    { Midi: [48], Duration: 0.25, TabPosition: [{ fret: 3, str: 5 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { tabEvents, measureStarts } = klangioJsonToTabEvents(score as any, "Guitar");
    expect(tabEvents).toHaveLength(2);
    expect(measureStarts).toEqual([1.0]);
    expect(tabEvents[0]).toMatchObject({ string: 6, fret: 1 });
    expect(tabEvents[0]?.startTime).toBeCloseTo(1.0, 6);
    // 4/4 @120 => 2.0s/measure; duration 0.25 => 0.5s
    expect(tabEvents[0]?.duration).toBeCloseTo(0.5, 6);
    expect(tabEvents[1]).toMatchObject({ string: 5, fret: 3 });
    expect(tabEvents[1]?.startTime).toBeCloseTo(1.5, 6);
  });
});
