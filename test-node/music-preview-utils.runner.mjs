import assert from "node:assert/strict";

import {
  apiOriginFromBase,
  computeNoteLaneGlyphs,
  midiToLaneY,
  midiToPitch,
  pitchToMidi,
  resolveAudioUrl,
  transposePitch,
  transpositionForInstrument,
} from "../dist-music-preview-utils-test/src/ui/pages/musicPreview.utils.js";

let failures = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("apiOriginFromBase returns origin", () => {
  assert.equal(apiOriginFromBase("http://localhost:3001/api"), "http://localhost:3001");
});

test("resolveAudioUrl resolves /uploads path against API origin", () => {
  assert.equal(
    resolveAudioUrl("http://localhost:3001/api", "/uploads/x.mp3"),
    "http://localhost:3001/uploads/x.mp3",
  );
});

test("pitchToMidi parses pitch strings", () => {
  assert.equal(pitchToMidi("C4"), 60);
  assert.equal(pitchToMidi("C#4"), 61);
  assert.equal(pitchToMidi("Bb3"), 58);
  assert.equal(pitchToMidi("A4"), 69);
  assert.equal(pitchToMidi("bad"), null);
});

test("midiToPitch formats midi numbers", () => {
  assert.equal(midiToPitch(60), "C4");
  assert.equal(midiToPitch(61), "C#4");
  assert.equal(midiToPitch(69), "A4");
});

test("transposePitch shifts pitch by semitones", () => {
  assert.equal(transposePitch("C4", 2), "D4");
  assert.equal(transposePitch("C4", -1), "B3");
  assert.equal(transposePitch("bad", 2), null);
});

test("transpositionForInstrument matches expected offsets", () => {
  assert.equal(transpositionForInstrument("clarinet"), 2);
  assert.equal(transpositionForInstrument("saxophone"), 9);
  assert.equal(transpositionForInstrument("piano"), 0);
  assert.equal(transpositionForInstrument("guitar"), 12);
});

test("midiToLaneY maps higher pitches higher (smaller y)", () => {
  const yTop = 60;
  const yBottom = 140;
  const yLow = midiToLaneY(48, { yTop, yBottom });
  const yHigh = midiToLaneY(84, { yTop, yBottom });
  assert.ok(yHigh < yLow);
  assert.ok(yHigh >= yTop && yHigh <= yBottom);
  assert.ok(yLow >= yTop && yLow <= yBottom);
});

test("computeNoteLaneGlyphs maps time to x at the playhead", () => {
  const glyphs = computeNoteLaneGlyphs({
    notes: [{ pitch: "C4", startTime: 10, duration: 0.5 }],
    currentTime: 10,
    instrument: "piano",
    viewWidth: 1000,
    playheadX: 200,
    pxPerSecond: 100,
    yTop: 60,
    yBottom: 140,
  });

  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].x, 200);
  assert.equal(glyphs[0].midi, 60);
  assert.equal(glyphs[0].isActive, true);
});

test("computeNoteLaneGlyphs applies instrument transposition", () => {
  const glyphs = computeNoteLaneGlyphs({
    notes: [{ pitch: "C4", startTime: 1, duration: 0.5 }],
    currentTime: 1,
    instrument: "clarinet", // +2 semitones
    viewWidth: 1000,
    playheadX: 200,
    pxPerSecond: 100,
    yTop: 60,
    yBottom: 140,
  });

  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].midi, 62); // D4
});

test("computeNoteLaneGlyphs filters notes outside the viewport", () => {
  const glyphs = computeNoteLaneGlyphs({
    notes: [{ pitch: "C4", startTime: 1000, duration: 0.5 }],
    currentTime: 0,
    instrument: "piano",
    viewWidth: 300,
    playheadX: 100,
    pxPerSecond: 50,
    yTop: 60,
    yBottom: 140,
  });

  assert.equal(glyphs.length, 0);
});

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
