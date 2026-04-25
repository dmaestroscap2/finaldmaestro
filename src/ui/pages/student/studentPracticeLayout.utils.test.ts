import { describe, expect, it } from "vitest";
import { buildPracticeSheetLayout } from "./studentPracticeLayout.utils";

describe("buildPracticeSheetLayout", () => {
  it("keeps top headroom above the practice staff so high notes remain visible", () => {
    const layout = buildPracticeSheetLayout(false);

    expect(layout.staffLineYs[0]!).toBeGreaterThanOrEqual(80);
    expect(layout.playheadY1).toBeLessThan(layout.staffLineYs[0]!);
    expect(layout.playheadY1).toBeGreaterThanOrEqual(50);
  });

  it("provides tab lane geometry with extra spacing when guitar tab is visible", () => {
    const layout = buildPracticeSheetLayout(true);

    expect(layout.viewHeight).toBeGreaterThan(360);
    expect(layout.tabLabelY).toBeLessThan(layout.tabLineYs[0]!);
    expect(layout.tabLineYs[5]! - layout.tabLineYs[0]!).toBe(60);
  });
});
