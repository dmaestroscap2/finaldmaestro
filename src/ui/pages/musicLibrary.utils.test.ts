import { describe, expect, it } from "vitest";
import { choosePreviewNoteSource } from "./musicLibrary.utils";

describe("choosePreviewNoteSource", () => {
  it("prefers Klang JSON for guitar when both JSON and MIDI quant are available", () => {
    const source = choosePreviewNoteSource(
      {
        klangioJson: "{\"Parts\":[]}",
        klangioMidiQuantPath: "/uploads/klangio/job/score.mid",
      },
      "guitar"
    );

    expect(source).toBe("klang_json");
  });

  it("prefers MIDI quant for non-guitar instruments when available", () => {
    const source = choosePreviewNoteSource(
      {
        klangioJson: "{\"Parts\":[]}",
        klangioMidiQuantPath: "/uploads/klangio/job/score.mid",
      },
      "piano"
    );

    expect(source).toBe("klang_json");
  });

  it("prefers Klang JSON for winds and brass so instrument-specific parts are preserved", () => {
    const source = choosePreviewNoteSource(
      {
        klangioJson: "{\"Parts\":[{\"Name\":\"A. Sax.\"}]}",
        klangioMidiQuantPath: "/uploads/klangio/job/score.mid",
      },
      "saxophone"
    );

    expect(source).toBe("klang_json");
  });

  it("supports the camelCase fields returned by the current API", () => {
    const source = choosePreviewNoteSource(
      {
        klangioJson: "{\"Parts\":[]}",
      },
      "guitar"
    );

    expect(source).toBe("klang_json");
  });

  it("falls back to stored when no richer Klang outputs exist", () => {
    const source = choosePreviewNoteSource({}, "piano");
    expect(source).toBe("stored");
  });
});
