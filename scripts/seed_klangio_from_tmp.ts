import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import { klangioJsonToExtractedNotes, pickKlangioPartNameForInstrument } from "../server/klangioScore";

type JobPick = { jobId: string; dir: string };

function newestJobDir(dir: string): JobPick | null {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (entries.length === 0) return null;

  let best: { jobId: string; mtimeMs: number } | null = null;
  for (const jobId of entries) {
    const p = join(dir, jobId);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(p).mtimeMs;
    } catch {
      continue;
    }
    if (!best || mtimeMs > best.mtimeMs) best = { jobId, mtimeMs };
  }
  return best ? { jobId: best.jobId, dir: join(dir, best.jobId) } : null;
}

function safeTitleFromFilename(p: string): string {
  const b = basename(p, extname(p));
  const cleaned = b.replace(/\s+/g, " ").replace(/[_]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Untitled";
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function copyIntoUploads(jobId: string, filename: string, srcAbs: string): { absPath: string; urlPath: string } {
  const uploadsDir = resolve("uploads", "klangio", jobId);
  ensureDir(uploadsDir);
  const destAbs = join(uploadsDir, filename);
  copyFileSync(srcAbs, destAbs);
  return { absPath: destAbs, urlPath: `/uploads/klangio/${jobId}/${filename}` };
}

function main() {
  const audioPath = process.argv[2];
  if (!audioPath) {
    // eslint-disable-next-line no-console
    console.error("Usage: npx tsx scripts/seed_klangio_from_tmp.ts <absolute-audio-path> [uploadedByUserId]");
    process.exitCode = 2;
    return;
  }

  const uploadedBy = Number.parseInt(process.argv[3] ?? "1", 10);
  const uploadedByUserId = Number.isFinite(uploadedBy) && uploadedBy > 0 ? uploadedBy : 1;

  const tmpBase = resolve(".tmp", "klangio-outputs", "all-outputs");
  const mxmlPick = newestJobDir(join(tmpBase, "mxml"));
  const midiPick = newestJobDir(join(tmpBase, "midi_quant"));
  const pdfPick = newestJobDir(join(tmpBase, "pdf"));
  const gp5Pick = newestJobDir(join(tmpBase, "gp5"));

  if (!mxmlPick) {
    // eslint-disable-next-line no-console
    console.error(`No mxml outputs found under ${join(tmpBase, "mxml")}`);
    process.exitCode = 1;
    return;
  }

  const jsonPath = join(mxmlPick.dir, "json.json");
  const mxmlPath = join(mxmlPick.dir, "mxml.musicxml");
  if (!existsSync(jsonPath) || !existsSync(mxmlPath)) {
    // eslint-disable-next-line no-console
    console.error(`Missing expected files in ${mxmlPick.dir} (need json.json + mxml.musicxml)`);
    process.exitCode = 1;
    return;
  }

  const scoreJsonText = readFileSync(jsonPath, "utf8");
  const score = JSON.parse(scoreJsonText);

  const partName = pickKlangioPartNameForInstrument(score, "guitar");
  const { notes, tempo, timeSignature } = klangioJsonToExtractedNotes(score, partName);
  const duration = notes.reduce((acc, n) => Math.max(acc, (n.startTime ?? 0) + (n.duration ?? 0)), 0);

  // Copy audio into /uploads so the app can serve it.
  ensureDir(resolve("uploads"));
  const ext = extname(audioPath) || ".mp3";
  const audioName = `${randomUUID()}${ext}`;
  const audioDestAbs = resolve("uploads", audioName);
  copyFileSync(audioPath, audioDestAbs);
  const audioUrlPath = `/uploads/${audioName}`;

  // Copy Klangio artifacts into /uploads/klangio/<jobId>/... so download buttons work.
  const jsonOut = copyIntoUploads(mxmlPick.jobId, "score.json", jsonPath);
  const mxmlOut = copyIntoUploads(mxmlPick.jobId, "score.musicxml", mxmlPath);

  const midiOut =
    midiPick && existsSync(join(midiPick.dir, "midi_quant.mid"))
      ? copyIntoUploads(midiPick.jobId, "score.midi_quant.mid", join(midiPick.dir, "midi_quant.mid")).urlPath
      : null;
  const pdfOut =
    pdfPick && existsSync(join(pdfPick.dir, "pdf.pdf"))
      ? copyIntoUploads(pdfPick.jobId, "score.pdf", join(pdfPick.dir, "pdf.pdf")).urlPath
      : null;
  const gp5Out =
    gp5Pick && existsSync(join(gp5Pick.dir, "gp5.gp5"))
      ? copyIntoUploads(gp5Pick.jobId, "score.gp5", join(gp5Pick.dir, "gp5.gp5")).urlPath
      : null;

  const title = safeTitleFromFilename(audioPath);
  const artist = "unknown";

  const db = new Database(resolve("data", "dmaestro.db"));
  const now = Date.now();

  const stmt = db.prepare(`
    insert into music_sheets (
      title, artist, uploaded_by, audio_path,
      duration, tempo, time_signature, difficulty,
      notes_json,
      klangio_job_id, klangio_model, klangio_json,
      klangio_json_path, klangio_mxml_path, klangio_midi_quant_path, klangio_pdf_path, klangio_gp5_path,
      created_at
    ) values (
      @title, @artist, @uploadedBy, @audioPath,
      @duration, @tempo, @timeSignature, @difficulty,
      @notesJson,
      @klangioJobId, @klangioModel, @klangioJson,
      @klangioJsonPath, @klangioMxmlPath, @klangioMidiQuantPath, @klangioPdfPath, @klangioGp5Path,
      @createdAt
    )
  `);

  const info = stmt.run({
    title,
    artist,
    uploadedBy: uploadedByUserId,
    audioPath: audioUrlPath,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 180,
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    timeSignature: typeof timeSignature === "string" ? timeSignature : null,
    difficulty: "medium",
    notesJson: JSON.stringify(notes),
    klangioJobId: mxmlPick.jobId,
    klangioModel: "multi",
    klangioJson: scoreJsonText,
    klangioJsonPath: jsonOut.urlPath,
    klangioMxmlPath: mxmlOut.urlPath,
    klangioMidiQuantPath: midiOut,
    klangioPdfPath: pdfOut,
    klangioGp5Path: gp5Out,
    createdAt: now,
  });

  const newId = Number(info.lastInsertRowid);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        insertedId: newId,
        title,
        partName,
        notes: notes.length,
        duration,
        tempo,
        timeSignature,
        audioPath: audioUrlPath,
        artifacts: {
          json: jsonOut.urlPath,
          mxml: mxmlOut.urlPath,
          midi_quant: midiOut,
          pdf: pdfOut,
          gp5: gp5Out,
        },
      },
      null,
      2
    )
  );
}

main();
