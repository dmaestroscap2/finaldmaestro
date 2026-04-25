import { readFile } from "node:fs/promises";
import midiPkg from "@tonejs/midi";
import type { ExtractedNote } from "../shared/schema";

const KLANGIO_API_BASE = "https://api.klang.io";

// Demo key (per user request): stored in repo for one-time presentation.
const KLANGIO_API_KEY = "0xkl-6d6d1ed1192434e48ddc7ffcae046175";

// @tonejs/midi is CommonJS; in Node ESM we need to access it via the default export.
const { Midi } = midiPkg as unknown as { Midi: typeof import("@tonejs/midi").Midi };

// Keep in sync with Klangio's published OpenAPI schema for transcription models.
export type KlangioModel =
  | "piano"
  | "guitar"
  | "bass"
  | "vocal"
  | "universal"
  | "lead"
  | "detect"
  | "drums"
  | "multi"
  | "wind"
  | "string"
  | "piano_arrangement";

export type KlangioOutputFormat =
  | "mxml"
  | "gp5"
  | "midi"
  | "midi_quant"
  | "pdf"
  | "json";

type FetchLike = typeof fetch;

export function midiToPitchName(midiNumber: number): string {
  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
  const pitchClass = pitchClasses[((midiNumber % 12) + 12) % 12]!;
  const octave = Math.floor(midiNumber / 12) - 1;
  return `${pitchClass}${octave}`;
}

function midiToFrequency(midiNumber: number): number {
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

export function midiBytesToExtractedNotes(
  midiBytes: Uint8Array
): { notes: ExtractedNote[]; duration: number; tempo: number } {
  const midi = new Midi(midiBytes);

  const tempo =
    midi.header.tempos?.[0]?.bpm && Number.isFinite(midi.header.tempos[0].bpm)
      ? midi.header.tempos[0].bpm
      : 120;

  const notes: ExtractedNote[] = midi.tracks.flatMap((track) =>
    track.notes.map((n) => ({
      pitch: midiToPitchName(n.midi),
      frequency: midiToFrequency(n.midi),
      startTime: n.time,
      duration: n.duration,
      velocity: n.velocity,
      confidence: Math.max(0, Math.min(1, n.velocity)),
    }))
  );

  return {
    notes,
    duration: midi.duration ?? Math.max(0, ...notes.map((n) => n.startTime + n.duration)),
    tempo,
  };
}

export async function createKlangioTranscriptionJob(
  params: {
    filePath: string;
    filename: string;
    model: KlangioModel;
    title?: string;
    composer?: string;
    outputs: KlangioOutputFormat[];
    webhookUrl?: string;
  },
  opts?: { fetchImpl?: FetchLike }
): Promise<{
  jobId: string;
  creationDate?: string;
  deletionDate?: string;
  statusEndpointUrl?: string;
  genXml?: boolean;
  genMidi?: boolean;
  genMidiQuant?: boolean;
  genGp5?: boolean;
  genPdf?: boolean;
}> {
  const fetchImpl = opts?.fetchImpl ?? fetch;

  // Use the platform FormData/Blob that undici fetch understands (not the `form-data` package).
  // For the demo workflow, buffering the upload is acceptable and avoids malformed multipart bodies.
  const fileBytes = await readFile(params.filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBytes]), params.filename);

  // Docusaurus docs show `data` params for outputs, not JSON.
  // `requests` will encode lists as repeated fields, so we mirror that:
  // outputs=midi&outputs=pdf...
  for (const output of params.outputs) {
    formData.append("outputs", output);
  }

  const url = new URL(`${KLANGIO_API_BASE}/transcription`);
  url.searchParams.set("model", params.model);
  if (params.title) url.searchParams.set("title", params.title);
  if (params.composer) url.searchParams.set("composer", params.composer);
  if (params.webhookUrl) url.searchParams.set("webhook_url", params.webhookUrl);

  const resp = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "kl-api-key": KLANGIO_API_KEY,
    },
    body: formData as any,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Klangio create job failed: HTTP ${resp.status} ${text}`.trim());
  }

  const json = (await resp.json()) as
    | {
        job_id?: string;
        jobId?: string;
        job?: { id?: string };
        creation_date?: string;
        deletion_date?: string;
        status_endpoint_url?: string;
        gen_xml?: boolean;
        gen_midi?: boolean;
        gen_midi_quant?: boolean;
        gen_gp5?: boolean;
        gen_pdf?: boolean;
      }
    | Record<string, unknown>;
  const jobId = (json as any).job_id ?? (json as any).jobId ?? (json as any).job?.id;
  if (!jobId) {
    throw new Error("Klangio create job failed: missing job_id in response");
  }

  // Many clients only need jobId, but these flags are useful for deciding which artifacts exist.
  return {
    jobId,
    creationDate: (json as any).creation_date,
    deletionDate: (json as any).deletion_date,
    statusEndpointUrl: (json as any).status_endpoint_url,
    genXml: (json as any).gen_xml,
    genMidi: (json as any).gen_midi,
    genMidiQuant: (json as any).gen_midi_quant,
    genGp5: (json as any).gen_gp5,
    genPdf: (json as any).gen_pdf,
  };
}

export async function pollKlangioJobStatus(
  jobId: string,
  params?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  opts?: { fetchImpl?: FetchLike }
): Promise<"COMPLETED"> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = params?.timeoutMs ?? 3 * 60_000;
  const pollIntervalMs = params?.pollIntervalMs ?? 2_000;
  const start = Date.now();

  while (true) {
    const resp = await fetchImpl(`${KLANGIO_API_BASE}/job/${encodeURIComponent(jobId)}/status`, {
      headers: { "kl-api-key": KLANGIO_API_KEY },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Klangio status failed: HTTP ${resp.status} ${text}`.trim());
    }

    const json = (await resp.json()) as { status?: string; error?: string; error_description?: string };
    const status = json.status;

    if (status === "COMPLETED") return "COMPLETED";
    if (status === "FAILED") {
      throw new Error(json.error_description || json.error || "Klangio job failed");
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Klangio job timed out after ${timeoutMs}ms (last status: ${status ?? "unknown"})`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

export async function fetchKlangioJobResult(
  jobId: string,
  format: "midi" | "midi_quant",
  opts?: { fetchImpl?: FetchLike }
): Promise<Uint8Array> {
  // Kept for backwards-compat: most app code expects MIDI bytes.
  return fetchKlangioJobOutput(jobId, format, opts);
}

function klangioOutputToEndpoint(format: KlangioOutputFormat): string {
  // API uses `/xml` endpoint for the MusicXML download (even though the output flag is `mxml`).
  if (format === "mxml") return "xml";
  return format;
}

export async function fetchKlangioJobOutput(
  jobId: string,
  format: KlangioOutputFormat,
  opts?: { fetchImpl?: FetchLike }
): Promise<Uint8Array> {
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const endpoint = klangioOutputToEndpoint(format);
  const resp = await fetchImpl(`${KLANGIO_API_BASE}/job/${encodeURIComponent(jobId)}/${endpoint}`, {
    headers: { "kl-api-key": KLANGIO_API_KEY },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Klangio result fetch failed: HTTP ${resp.status} ${text}`.trim());
  }

  const buffer = await resp.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function transcribeKlangioExtractedNotes(
  params: {
    filePath: string;
    filename: string;
    model: KlangioModel;
    title?: string;
    composer?: string;
    outputs: KlangioOutputFormat[];
    webhookUrl?: string;
    resultFormat: "midi" | "midi_quant";
  },
  opts?: {
    fetchImpl?: FetchLike;
    poll?: { timeoutMs?: number; pollIntervalMs?: number };
  }
): Promise<{
  jobId: string;
  midiBytes: Uint8Array;
  notes: ExtractedNote[];
  duration: number;
  tempo: number;
}> {
  const fetchOpts = opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : undefined;

  const { jobId } = await createKlangioTranscriptionJob(params, fetchOpts);
  await pollKlangioJobStatus(jobId, opts?.poll, fetchOpts);
  const midiBytes = await fetchKlangioJobResult(jobId, params.resultFormat, fetchOpts);
  const { notes, duration, tempo } = midiBytesToExtractedNotes(midiBytes);
  return { jobId, midiBytes, notes, duration, tempo };
}
