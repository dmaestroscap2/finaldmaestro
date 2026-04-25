import { describe, expect, it } from "vitest";
import {
  buildClassroomAssignmentOptions,
  buildMusicAssignmentOptions,
} from "./assignmentDropdowns.utils";

describe("assignmentDropdowns utils", () => {
  it("builds classroom options from latest server rows and excludes deleted ids", () => {
    expect(
      buildClassroomAssignmentOptions([
        { id: 3, name: "Jazz Advanced" },
        { id: 1, name: "Pup Brushbond" },
      ])
    ).toEqual([
      { value: "1", label: "Pup Brushbond" },
      { value: "3", label: "Jazz Advanced" },
    ]);
  });

  it("builds music options from latest uploaded pieces", () => {
    expect(
      buildMusicAssignmentOptions([
        { id: 2, title: "Sugarcane", artist: "Leonora" },
        { id: 1, title: "Happu", artist: "Happy" },
      ])
    ).toEqual([
      { value: "1", label: "Happu - Happy" },
      { value: "2", label: "Sugarcane - Leonora" },
    ]);
  });
});
