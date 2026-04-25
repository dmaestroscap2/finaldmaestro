import { describe, expect, it, vi } from "vitest";
import { Midi } from "@tonejs/midi";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { midiBytesToExtractedNotes, midiToPitchName } from "./klangio";
import {
  createKlangioTranscriptionJob,
  fetchKlangioJobOutput,
  fetchKlangioJobResult,
  pollKlangioJobStatus,
} from "./klangio";

describe("midiToPitchName", () => {
  it("formats midi numbers into note names", () => {
    expect(midiToPitchName(60)).toBe("C4");
    expect(midiToPitchName(61)).toBe("C#4");
    expect(midiToPitchName(69)).toBe("A4");
  });
});

describe("midiBytesToExtractedNotes", () => {
  it("converts a MIDI buffer to ExtractedNote[]", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({
      midi: 60,
      time: 0.5,
      duration: 0.25,
      velocity: 0.8,
    });

    const bytes = midi.toArray();
    const { notes, duration } = midiBytesToExtractedNotes(bytes);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.pitch).toBe("C4");
    expect(notes[0]?.startTime).toBeCloseTo(0.5, 6);
    expect(notes[0]?.duration).toBeCloseTo(0.25, 6);
    // @tonejs/midi normalizes velocity values; don't assert exact floating precision.
    expect(notes[0]?.velocity).toBeCloseTo(0.8, 2);
    expect(duration).toBeGreaterThan(0.7);
  });
});

describe("Klangio HTTP workflow helpers", () => {
  it("creates a transcription job against /transcription", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dmaestro-klangio-"));
    const filePath = join(dir, "test.wav");
    writeFileSync(filePath, new Uint8Array([1, 2, 3, 4]));

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("https://api.klang.io/transcription");
      expect(url).toContain("model=universal");
      expect(init?.method).toBe("POST");
      // @ts-expect-error - headers shape varies
      expect(init?.headers?.["kl-api-key"]).toBeTruthy();
      return new Response(JSON.stringify({ job_id: "JOB123" }), { status: 200 });
    }) as any;

    const { jobId } = await createKlangioTranscriptionJob(
      {
        filePath,
        filename: "test.wav",
        model: "universal",
        title: "T",
        composer: "C",
        outputs: ["midi_quant"],
      },
      { fetchImpl }
    );

    expect(jobId).toBe("JOB123");
  });

  it("polls /job/:id/status until COMPLETED", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "IN_PROGRESS" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 })) as any;

    const status = await pollKlangioJobStatus(
      "JOB123",
      { timeoutMs: 5_000, pollIntervalMs: 1 },
      { fetchImpl }
    );

    expect(status).toBe("COMPLETED");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("fetches job result bytes from /job/:id/midi_quant", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.klang.io/job/JOB123/midi_quant");
      return new Response(new Uint8Array([77, 84, 104, 100]).buffer, { status: 200 });
    }) as any;

    const bytes = await fetchKlangioJobResult("JOB123", "midi_quant", { fetchImpl });
    expect(Array.from(bytes)).toEqual([77, 84, 104, 100]);
  });

  it("fetches non-MIDI outputs via fetchKlangioJobOutput (mxml maps to /xml)", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
    }) as any;

    await fetchKlangioJobOutput("JOB123", "mxml", { fetchImpl });
    await fetchKlangioJobOutput("JOB123", "pdf", { fetchImpl });
    await fetchKlangioJobOutput("JOB123", "gp5", { fetchImpl });
    await fetchKlangioJobOutput("JOB123", "json", { fetchImpl });
    await fetchKlangioJobOutput("JOB123", "midi", { fetchImpl });
    await fetchKlangioJobOutput("JOB123", "midi_quant", { fetchImpl });

    expect(seen).toContain("https://api.klang.io/job/JOB123/xml");
    expect(seen).toContain("https://api.klang.io/job/JOB123/pdf");
    expect(seen).toContain("https://api.klang.io/job/JOB123/gp5");
    expect(seen).toContain("https://api.klang.io/job/JOB123/json");
    expect(seen).toContain("https://api.klang.io/job/JOB123/midi");
    expect(seen).toContain("https://api.klang.io/job/JOB123/midi_quant");
  });
});
