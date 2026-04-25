# Klangio Outputs Audit And Usage Plan

Date: 2026-04-17

## Summary

This document audits how the current app stores and uses Klang outputs, where precision is lost, and how to make the preview/playback pipeline more accurate.

Current conclusion:

- The app already stores all important Klang artifacts correctly.
- The app is only actively parsing two of them today:
  - `klangio_json`
  - `klangio_midi_quant_path`
- The app is partly correct, but it is using flattened event data in places where score-aware artifacts should be used instead.
- The biggest precision gap is not "bad JSON parsing everywhere". The bigger problem is that the current preview treats derived note/tab events as if they are equivalent to Klang's rendered score.

Recommended direction:

- Use `Klang JSON` for backend part discovery, inspection, and fallback tab metadata.
- Use `MusicXML` for score rendering in the app.
- Use `MIDI-quant` for playback and time-aligned synth scheduling.
- Keep `PDF` as view/print only.
- Keep `GP5` as guitar-tab interoperability/export, not as the primary v1 browser rendering source.

## Current Storage And Retrieval

### Persisted Outputs

The app currently persists these Klang fields on `music_sheets`:

- `klangio_job_id`
- `klangio_model`
- `klangio_json`
- `klangio_json_path`
- `klangio_mxml_path`
- `klangio_midi_quant_path`
- `klangio_pdf_path`
- `klangio_gp5_path`

Artifacts are stored under:

- `uploads/klangio/<jobId>/...`

The backend download/persist flow is implemented in:

- `server/index.ts`

The SQLite schema and bootstrap migration are implemented in:

- `shared/schema.ts`
- `server/db.ts`

### Current Read Paths

`GET /api/music/:id` currently supports three note sources:

- `source=klang_json`
- `source=midi_quant`
- `source=stored`

Current behavior:

- `stored`
  - returns legacy `notes_json`
- `midi_quant`
  - reads the saved quantized MIDI
  - selects one track heuristically for the requested instrument
  - returns flattened `notes`
- `klang_json`
  - parses raw Klang JSON
  - picks a part by instrument
  - returns flattened `notes`
  - returns `tabEvents` and `tabMeasureStarts` when `TabPosition` exists

This logic lives in:

- `server/index.ts`
- `server/klangioScore.ts`
- `server/klangioTab.ts`
- `server/midiScore.ts`

## Audit By Output Type

## 1. Klang JSON

### What It Contains

Current evidence from the real Leonora `multi` job:

- parts detected:
  - `Vocals`
  - `Piano`
  - `Guitar`
  - `Bass`
  - `Violin`
  - `Wind`
  - `Drums`
- guitar part has `Tab=true`
- bass part has `Tab=true`

The JSON contains:

- `MusicInfo`
  - tempo
  - time signature
  - measure duration
- parts
- measures
- measure timestamps
- voices
- note durations
- MIDI note arrays
- guitar `TabPosition`
- tie flags
- beat effects / note effects

Important finding:

- For guitar, `TabPosition` is internally coherent.
- There was no observed mismatch where `Midi.length !== TabPosition.length` for the Leonora guitar sample.
- Example mapping from the sample:
  - `str=6, fret=1 -> midi=41`
  - `str=5, fret=3 -> midi=48`
  - `str=4, fret=3 -> midi=53`
  - `str=3, fret=2` and `str=2, fret=1` appear together as a chord

### What We Use It For Today

- selecting the best part by instrument
- generating flattened `ExtractedNote[]`
- generating `tabEvents`
- providing `availableParts`

### What Is Correct Today

- part detection is fundamentally correct
- guitar tab extraction is fundamentally correct as data extraction
- string numbering is correct as `1..6` with `1 = high string`
- measure timestamps are being used

### What Is Lossy Today

The current `klangioJsonToExtractedNotes()` path flattens score structure into note events:

- ties are not merged into musically sustained notes
- tuplets are not preserved as notation semantics
- voice/staff relationships are lost
- chord relationships are flattened into simultaneous notes
- notation-specific layout meaning is discarded

The current `klangioJsonToTabEvents()` path is also event-level only:

- it preserves fret/string/time
- it does not preserve score layout
- it does not render tab as an engraved system

### Correct Role Going Forward

`Klang JSON` should be treated as:

- the canonical structured analysis payload
- the best backend payload for part discovery and fallback tab metadata
- a debug/audit source

`Klang JSON` should not be treated as:

- the final score rendering format

## 2. MusicXML

### What It Contains

This is the most important underused output in the current app.

Observed from the Leonora MusicXML:

- duplicate `Guitar` parts in the part list
- duplicate `Bass` parts in the part list
- explicit `<technical><string>` and `<technical><fret>` notation
- score part structure, noteheads, staff/voice semantics, ties, tuplets, harmony blocks, and printed notation layout data

Important interpretation:

- The duplicate `Guitar` and `Bass` parts strongly suggest that Klang exported separate score-oriented representations that the app currently ignores.
- This is likely why the PDF/Studio view feels more correct than the current in-app SVG lane. Klang is not drawing from a flattened event list; it is rendering a notation-aware score format.

### What We Use It For Today

- storage
- download button only

### What We Are Not Using Yet

- in-app score rendering
- engraved tab/staff parity
- notation-aware visual comparison with Klang PDF

### Correct Role Going Forward

`MusicXML` should become the primary source for:

- in-app score rendering
- guitar score/tab rendering
- layout parity with Klang's score view

This should replace the current assumption that a hand-drawn SVG lane is "sheet music preview".

The SVG lane can remain, but it should be positioned as a practice lane, not as authoritative notation.

## 3. MIDI-quant

### What It Contains

Observed from the Leonora `midi_quant` output:

- track names are present
- program numbers are present
- channels are present
- the file contains clear per-part tracks

Observed tracks:

- `Vocals`
- `Piano` (two piano tracks)
- `Guitar`
- `Bass`
- `Violin`
- `Wind`
- `Drums`

Observed guitar track:

- program `24`
- name `Guitar`
- channel `3`
- note range `40..82`

### What We Use It For Today

- instrument-specific note playback
- timing-aligned synth scheduling
- source selection for preview notes

### What Is Correct Today

- using `MIDI-quant` for playback/timing is the right direction
- track selection is now safer than before because the picker uses GM program/name and range heuristics

### What It Should Not Be Used For

- tablature display
- final score rendering

### Correct Role Going Forward

`MIDI-quant` should remain the default source for:

- synth playback
- timeline-based practice lane playback
- DAW export
- note scheduling that needs stable timing

## 4. PDF

### What It Contains

- the rendered final score output from Klang

### What We Use It For Today

- view/download only

### Correct Role Going Forward

Keep it as:

- print/view/download
- visual validation artifact for QA

Do not try to parse it for app logic.

## 5. GP5

### What It Contains

- Guitar Pro output, likely the richest export for guitar-specific external workflows

### What We Use It For Today

- download only

### Correct Role Going Forward

Keep it as:

- external guitar/tab interoperability
- advanced export for guitar-focused tooling

Do not make it the primary v1 browser render target unless the team explicitly chooses a GP5 parsing/rendering route.

`MusicXML` is the lower-friction in-app rendering source.

## 6. Stored Notes JSON

### What It Is

- app-local flattened note cache

### Correct Role Going Forward

Treat it as:

- legacy fallback
- compatibility cache

Do not treat it as the precision source for modern Klang-backed rows.

## Current Precision Gaps

## 1. We Are Mixing Event Semantics With Score Semantics

Current issue:

- `klangio_json` and `midi_quant` are parsed into flat note events
- the UI then draws those events in a simplified SVG lane
- that lane is labeled and perceived as score preview

Problem:

- event data is good for playback lanes
- event data is not equivalent to engraved score rendering

Impact:

- notes can be "correct enough" musically but still look wrong compared to Klang PDF/Studio
- tab spacing, bar grouping, staff alignment, and chord grouping can feel off even when raw string/fret extraction is right

## 2. JSON Parsing Is Correct In Some Places, But Still Lossy

What appears correct:

- guitar `TabPosition` extraction
- part selection
- basic timestamp conversion

What is still incomplete:

- ties are emitted as separate note events
- chord/engraving relationships are flattened
- notation layout decisions are absent

Observed in Leonora guitar JSON:

- 62 tied note entries exist in the sampled part
- those are currently not normalized into a higher-level notation/playback model

## 3. The UI Has Historically Allowed Mixed-Source States

This has already been partially corrected:

- guitar now prefers `klang_json`
- stale `tabEvents` are cleared when source is not `klang_json`

However, the broader source split is still not explicit enough:

- visual score concerns and playback concerns still share the same modal surface
- a user can still assume that all preview elements are sourced from one authoritative score model when they are not

## 4. We Underuse MusicXML

This is the main architectural gap.

Klang has already produced a notation-aware score artifact.
The current app stores it, exposes it, and then does almost nothing with it.

That is the clearest opportunity to improve precision.

## Recommended Source Of Truth Matrix

Use this as the canonical product rule set.

| Concern | Primary Source | Secondary Source | Notes |
|---|---|---|---|
| Part discovery | Klang JSON | MIDI metadata | JSON is the best analysis payload |
| Available instruments/parts | Klang JSON | MusicXML part list | JSON is easiest to inspect server-side |
| In-app score rendering | MusicXML | none | Do not use flattened notes for this |
| Guitar tab rendering | MusicXML | Klang JSON fallback | MusicXML is preferred if rendered properly |
| Playback timing | MIDI-quant | Klang JSON fallback | MIDI-quant is better for scheduling |
| Synth playback pitch events | MIDI-quant | Klang JSON | keep event playback separate from score rendering |
| Debug inspection | Klang JSON | MIDI-quant track info | JSON is easiest to audit |
| Print/download | PDF | MusicXML | PDF remains output artifact |
| Guitar export/interoperability | GP5 | MusicXML | GP5 is for external tooling |
| Legacy fallback | stored notes_json | none | only when other outputs are unavailable |

## Recommended Product Behavior

## 1. Split Visual Preview From Playback Preview

The modal should eventually expose two different concepts:

- `Score View`
  - MusicXML-driven
- `Practice Lane`
  - event-driven

The current SVG lane should be renamed conceptually:

- it is a practice lane
- it is not authoritative score notation

## 2. Use MusicXML For Score View

Recommended implementation:

- integrate a real MusicXML renderer in the frontend
- recommended renderer: `OpenSheetMusicDisplay`

Expected benefits:

- closer parity with Klang PDF
- proper score/tab presentation
- less hand-maintained layout logic
- less chance of inventing incorrect visual interpretation from raw note events

## 3. Keep MIDI-quant For Playback

Recommended implementation:

- keep `MIDI-quant` as the playback engine source
- keep the improved instrument-specific track picker
- do not derive tab display from `MIDI-quant`

## 4. Keep JSON For Backend Selection And Debug

Recommended implementation:

- keep `pickKlangioPartNameForInstrument()`
- keep `availableParts`
- keep JSON-based tab fallback if MusicXML render is unavailable
- add more explicit debug fields when preview data is fetched

Recommended debug fields:

- `sourceUsed`
- `partName`
- `availableParts`
- `trackIndex` when using `midi_quant`
- note count
- tab event count

## Concrete Implementation Plan

## Phase 1. Clarify the current UI contract

- Update preview terminology so the current SVG lane is not presented as full sheet music.
- Explicitly separate:
  - visual source
  - playback source
- Continue hiding tab data unless the selected source actually provides tab.

## Phase 2. Add MusicXML-backed score rendering

- Add a new frontend score renderer for `selectedMusic.klangioMxmlPath`
- Treat this as the primary score view
- For guitar:
  - prefer MusicXML-rendered tab/staff
- For non-guitar instruments:
  - prefer MusicXML-rendered notation if the renderer can isolate the selected part

## Phase 3. Keep event-driven playback separate

- Continue using `MIDI-quant` for timing and synth playback
- Keep `klang_json` as fallback when MIDI-quant is missing
- Do not couple playback source to score rendering source

## Phase 4. Strengthen backend metadata

- Add a `musicxml`-aware response mode or include explicit `musicxmlPath` metadata in the preview payload
- Return resolved part metadata consistently across all sources
- Add lightweight debug fields in dev mode

## Phase 5. Use JSON As A Structured Fallback, Not As The Score Renderer

- Preserve JSON parsing for:
  - part picking
  - part availability
  - tab fallback
  - audit tooling
- Stop treating flattened note event conversion as the end-state score model

## Acceptance Checks

The following should be true after the recommended migration:

- A multi-instrument upload stores all five Klang artifacts plus raw JSON.
- `GET /api/music/:id?instrument=guitar&source=klang_json` returns:
  - `partName=Guitar`
  - `tabEvents`
  - `availableParts`
- `GET /api/music/:id?instrument=guitar&source=midi_quant` resolves the real guitar track, not bass.
- The UI never shows stale tab data when the visual source is not tab-capable.
- `Score View` for guitar is based on `MusicXML`, not the hand-built SVG lane.
- The app uses `MIDI-quant` for playback timing even when `MusicXML` is used for visual rendering.
- Leonora-style chord groupings such as:
  - `6:1`
  - `5:3`
  - `4:3`
  - `3:2`
  - `2:1`
  visually group the same way as the source score, instead of relying on approximate event spacing.

## Final Recommendation

The correct next architectural move is:

- keep the existing JSON and MIDI parsing
- stop expecting them to fully replicate Klang's score view
- add a real `MusicXML` rendering path

Short version:

- `JSON` = structured analysis and backend selection
- `MusicXML` = score rendering
- `MIDI-quant` = playback
- `PDF` = print/view
- `GP5` = guitar export/interoperability

That division uses each Klang output for what it is actually good at, instead of forcing one flattened event model to do every job.
