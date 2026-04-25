import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  createKlangioTranscriptionJob,
  fetchKlangioJobOutput,
  pollKlangioJobStatus,
} from "../dist-klangio-test/server/klangio.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createWithRetry(createFn, args, attempts = 4, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await createFn(args);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      // Transient network errors can happen (ECONNRESET).
      if (msg.includes("fetch failed") || msg.includes("ECONNRESET")) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function downloadWithRetry(jobId, fmt, attempts = 8, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchKlangioJobOutput(jobId, fmt);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      // KL003: Blob does not exist (often transient just after COMPLETED).
      if (msg.includes("HTTP 404") || msg.includes("KL003")) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const filePath = process.env.KLANGIO_TEST_FILE;
assert.ok(
  filePath && filePath.length > 0,
  "Set env var KLANGIO_TEST_FILE to an absolute path of an audio file (mp3/wav)."
);

const model = process.env.KLANGIO_MODEL || "universal";
// We create one job per output format because in practice (for some accounts/models)
// requesting multiple outputs in a single job can yield missing artifacts (404 KL003)
// even after status becomes COMPLETED. Single-output jobs have been reliable.
const targets =
  process.env.KLANGIO_TARGETS?.split(",").map((s) => s.trim()).filter(Boolean) ||
  ["mxml", "midi", "midi_quant", "pdf", "gp5"];

const filename = path.basename(filePath);

const batchDir = path.resolve(".tmp", "klangio-outputs", "all-outputs");
mkdirSync(batchDir, { recursive: true });

const extByOutput = {
  mxml: "musicxml",
  midi: "mid",
  midi_quant: "mid",
  pdf: "pdf",
  gp5: "gp5",
  json: "json",
};

for (const target of targets) {
  const job = await createWithRetry(createKlangioTranscriptionJob, {
    filePath,
    filename,
    model,
    title: process.env.KLANGIO_TITLE || filename,
    composer: process.env.KLANGIO_COMPOSER || "unknown",
    outputs: [target],
  });

  process.stdout.write(`\n=== ${target} job_id=${job.jobId} ===\n`);
  process.stdout.write(
    `gen flags: xml=${job.genXml} midi=${job.genMidi} midi_quant=${job.genMidiQuant} pdf=${job.genPdf} gp5=${job.genGp5}\n`
  );

  await pollKlangioJobStatus(job.jobId, {
    timeoutMs: Number(process.env.KLANGIO_TIMEOUT_MS || 10 * 60_000),
    pollIntervalMs: Number(process.env.KLANGIO_POLL_MS || 2_000),
  });

  const outDir = path.join(batchDir, target, job.jobId);
  mkdirSync(outDir, { recursive: true });

  const downloads = [target, "json"];
  for (const fmt of downloads) {
    try {
      const bytes = await downloadWithRetry(job.jobId, fmt, 10, 1500);
      const outPath = path.join(outDir, `${fmt}.${extByOutput[fmt] || "bin"}`);
      writeFileSync(outPath, Buffer.from(bytes));
      process.stdout.write(`downloaded ${fmt} -> ${outPath}\n`);
    } catch (e) {
      process.stdout.write(`FAILED ${fmt}: ${e?.message || e}\n`);
    }
  }

  // Small gap between jobs to stay well under rate limits.
  await sleep(750);
}
