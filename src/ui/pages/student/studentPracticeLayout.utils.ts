export function buildPracticeSheetLayout(previewHasTabLane: boolean) {
  const staffLineYs = [82, 102, 122, 142, 162];
  const staffTop = staffLineYs[0]!;
  const staffBottom = staffLineYs[staffLineYs.length - 1]!;
  const tabYTop = 248;
  const tabSpacing = 12;
  const viewHeight = previewHasTabLane ? 392 : 292;

  return {
    viewHeight,
    staffLineYs,
    barlineY1: staffTop,
    barlineY2: staffBottom,
    clefX: 48,
    clefY: 116,
    playheadX: 420,
    playheadY1: 56,
    playheadY2: staffBottom + 18,
    tabLabelX: 30,
    tabLabelY: 240,
    tabYTop,
    tabLineYs: [0, 1, 2, 3, 4, 5].map((index) => tabYTop + index * tabSpacing),
    tabBarlineY1: tabYTop,
    tabBarlineY2: tabYTop + 5 * tabSpacing,
    tabSpacing,
  };
}
