import assert from "node:assert/strict";

import { formatDuration, getNoteCount } from "../dist-music-utils-test/src/ui/pages/musicLibrary.utils.js";

let failures = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("formatDuration formats seconds as m:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(42), "0:42");
  assert.equal(formatDuration(60), "1:00");
  assert.equal(formatDuration(179.1), "2:59");
});

test("formatDuration handles bad inputs", () => {
  assert.equal(formatDuration(undefined), "--:--");
  assert.equal(formatDuration(null), "--:--");
  assert.equal(formatDuration(Number.NaN), "--:--");
  assert.equal(formatDuration(-1), "--:--");
});

test("getNoteCount prefers notes[] over notesJson", () => {
  assert.equal(getNoteCount({ notes: [1, 2, 3] }), 3);
});

test("getNoteCount parses notesJson when notes[] missing", () => {
  assert.equal(getNoteCount({ notesJson: "[{\"x\":1},{\"x\":2}]" }), 2);
  assert.equal(getNoteCount({ notesJson: "[]" }), 0);
});

test("getNoteCount returns 0 on invalid notesJson", () => {
  assert.equal(getNoteCount({ notesJson: "not json" }), 0);
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

