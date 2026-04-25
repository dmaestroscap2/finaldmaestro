import assert from "node:assert/strict";
import midiPkg from "@tonejs/midi";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createKlangioTranscriptionJob,
  fetchKlangioJobResult,
  midiBytesToExtractedNotes,
  midiToPitchName,
  pollKlangioJobStatus,
} from "../dist-klangio-test/server/klangio.js";

const { Midi } = midiPkg;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("midiToPitchName formats midi numbers into note names", () => {
  assert.equal(midiToPitchName(60), "C4");
  assert.equal(midiToPitchName(61), "C#4");
  assert.equal(midiToPitchName(69), "A4");
});

test("midiBytesToExtractedNotes converts a MIDI buffer to ExtractedNote[]", () => {
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

  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.pitch, "C4");
  assert.ok(Math.abs((notes[0]?.startTime ?? 0) - 0.5) < 1e-6);
  assert.ok(Math.abs((notes[0]?.duration ?? 0) - 0.25) < 1e-6);
  assert.ok(Math.abs((notes[0]?.velocity ?? 0) - 0.8) < 0.05);
  assert.ok(duration > 0.7);
});

test("createKlangioTranscriptionJob creates a transcription job against /transcription", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmaestro-klangio-"));
  const filePath = join(dir, "test.wav");
  writeFileSync(filePath, new Uint8Array([1, 2, 3, 4]));

  const fetchImpl = async (url, init) => {
    assert.ok(url.includes("https://api.klang.io/transcription"));
    assert.ok(url.includes("model=universal"));
    assert.equal(init?.method, "POST");
    assert.ok(init?.headers?.["kl-api-key"]);
    return new Response(JSON.stringify({ job_id: "JOB123" }), { status: 200 });
  };

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

  assert.equal(jobId, "JOB123");
});

test("pollKlangioJobStatus polls /job/:id/status until COMPLETED", async () => {
  let call = 0;
  const fetchImpl = async () => {
    call++;
    if (call === 1) {
      return new Response(JSON.stringify({ status: "IN_PROGRESS" }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 });
  };

  const status = await pollKlangioJobStatus("JOB123", { timeoutMs: 5_000, pollIntervalMs: 1 }, { fetchImpl });

  assert.equal(status, "COMPLETED");
  assert.ok(call >= 2);
});

test("pollKlangioJobStatus throws when job FAILED", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: "FAILED", error_description: "nope" }), { status: 200 });

  await assert.rejects(() => pollKlangioJobStatus("JOB123", { timeoutMs: 100, pollIntervalMs: 1 }, { fetchImpl }), /nope/);
});

test("fetchKlangioJobResult fetches job result bytes from /job/:id/midi_quant", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://api.klang.io/job/JOB123/midi_quant");
    return new Response(new Uint8Array([77, 84, 104, 100]).buffer, { status: 200 });
  };

  const bytes = await fetchKlangioJobResult("JOB123", "midi_quant", { fetchImpl });
  assert.deepEqual(Array.from(bytes), [77, 84, 104, 100]);
});

test("fetchKlangioJobResult throws on non-OK response", async () => {
  const fetchImpl = async () => new Response("bad", { status: 500 });
  await assert.rejects(() => fetchKlangioJobResult("JOB123", "midi_quant", { fetchImpl }), /HTTP 500/);
});

test("transcribeKlangioExtractedNotes orchestrates create -> poll -> fetch -> parse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmaestro-klangio-"));
  const filePath = join(dir, "test.wav");
  writeFileSync(filePath, new Uint8Array([1, 2, 3, 4]));

  const midi = new Midi();
  const track = midi.addTrack();
  track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.7 });
  const midiBytes = midi.toArray();

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });

    if (String(url).startsWith("https://api.klang.io/transcription")) {
      return new Response(JSON.stringify({ job_id: "JOB123" }), { status: 200 });
    }
    if (String(url) === "https://api.klang.io/job/JOB123/status") {
      return new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 });
    }
    if (String(url) === "https://api.klang.io/job/JOB123/midi_quant") {
      return new Response(midiBytes.buffer, { status: 200 });
    }

    return new Response("unexpected", { status: 500 });
  };

  const { transcribeKlangioExtractedNotes } = await import(
    "../dist-klangio-test/server/klangio.js"
  );

  const out = await transcribeKlangioExtractedNotes(
    {
      filePath,
      filename: "test.wav",
      model: "universal",
      title: "T",
      composer: "C",
      outputs: ["midi_quant"],
      resultFormat: "midi_quant",
    },
    { fetchImpl, poll: { timeoutMs: 1000, pollIntervalMs: 1 } }
  );

  assert.equal(out.jobId, "JOB123");
  assert.equal(out.notes.length, 1);
  assert.equal(out.notes[0]?.pitch, "C4");
  assert.ok(calls.some((c) => c.url.includes("/transcription")));
  assert.ok(calls.some((c) => c.url.endsWith("/status")));
  assert.ok(calls.some((c) => c.url.endsWith("/midi_quant")));
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`not ok - ${name}\n`);
    process.stdout.write(`${err?.stack || err}\n`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  process.stdout.write(`\nFAILED: ${failures}/${tests.length}\n`);
} else {
  process.stdout.write(`\nPASSED: ${tests.length}/${tests.length}\n`);
}
