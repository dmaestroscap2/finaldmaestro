# Klang Preview And MusicXML Progress - 2026-04-17

## Branch

- Current branch: `feat/implementation-phase-1`

## Latest checkpoint commits

- `5395b8d` - `Add MusicXML debug page`
- `d7549e3` - `Improve Klang preview note mapping`
- `2a7cfc9` - `Adjust preview staff spacing`

## Current upload/transcription behavior

- New uploads currently default to Klang model `multi` on the server.
- This is set in `server/index.ts` in the `/api/music/transcribe-klangio` route.
- The client upload path does not currently expose a model selector.
- The client sends only:
  - `audio`
  - `title`
  - `artist`
- The server then runs separate Klang jobs for output artifacts:
  - `mxml`
  - `midi_quant`
  - `pdf`
  - `gp5`
- The saved row stores:
  - `klangioJson`
  - `klangioJsonPath`
  - `klangioMxmlPath`
  - `klangioMidiQuantPath`
  - `klangioPdfPath`
  - `klangioGp5Path`

## What is implemented now

### 1. MusicXML debug page

- Added a MusicXML debug route:
  - `/instructor/debug/musicxml`
- Page file:
  - `src/ui/pages/MusicXmlDebugPage.tsx`
- Current behavior:
  - loads saved `score.musicxml`
  - fetches metadata from `/api/music/:id`
  - tries to filter the MusicXML down to the selected part
  - renders with OpenSheetMusicDisplay
  - falls back to full-score render if filtered render fails
  - shows debug info:
    - requested instrument
    - resolved part
    - matched MusicXML part IDs
    - render mode
    - available parts
    - MusicXML path

### 2. Preview source selection fix

- A real bug was fixed in the preview modal:
  - the UI was checking snake_case fields like `klangio_json`
  - the API returns camelCase fields like `klangioJson`
- Result before fix:
  - preview often fell back to `stored` notes even when richer Klang outputs existed
- Result after fix:
  - guitar prefers `klang_json`
  - non-guitar prefers `midi_quant` when available
- Helper added:
  - `src/ui/pages/musicLibrary.utils.ts`
- Tests added:
  - `src/ui/pages/musicLibrary.utils.test.ts`

### 3. Note preview mapping improvements

- The note preview no longer uses only a crude MIDI-to-Y heatmap.
- It now uses staff-step-based placement with:
  - written-pitch transposition rules
  - clef-aware placement
  - ledger line generation
- Current preview utility:
  - `src/ui/pages/musicPreview.utils.ts`
- Tests added:
  - `src/ui/pages/musicPreview.utils.test.ts`

### 4. Tie handling from Klang JSON

- The server parser was updated to stop discarding `TieStart` / `TieStop`.
- This applies to:
  - extracted notes parser
  - tab event parser
- Files updated:
  - `server/klangioScore.ts`
  - `server/klangioTab.ts`
- Tests added in:
  - `server/klangioScore.test.ts`

### 5. Preview layout spacing fix

- The preview had a visual collision where the notation staff and TAB staff overlapped.
- The preview SVG height and TAB start position were increased to create more separation.
- File updated:
  - `src/ui/pages/MusicLibraryPage.tsx`

## Confirmed current data shape from saved Klang JSON

- Real saved parts observed in uploaded score JSON:
  - `Vocals`
  - `Piano`
  - `Guitar`
  - `Bass`
  - `Violin`
  - `Wind`
  - `Drums`
- Real note fields observed in saved JSON include:
  - `Midi`
  - `Duration`
  - `Velocity`
  - `TieStart`
  - `TieStop`
  - `TabPosition`
- For guitar, `TabPosition` contains explicit:
  - `fret`
  - `str`

## Current limits / known issues

### 1. Preview is still a simplified custom renderer

- Even after the fixes above, the preview is still not fully PDF-faithful.
- It is still reconstructing notation from simplified note data for display.
- This means it can still diverge from Klang PDF / MusicXML in:
  - exact vertical notation placement
  - engraving quality
  - beaming
  - tuplets
  - chord spelling
  - grand staff / proper staff systems

### 2. Best source by purpose

- Best source for accurate score rendering:
  - `MusicXML`
- Best source for timing / interaction / part-aware custom logic:
  - `Klang JSON`
- Best source for synthesized playback / DAW-style note stream:
  - `MIDI (midi_quant)`
- `PDF` is view/print only

### 3. Instrument selection is still heuristic

- We currently pick the best part for the selected instrument using server-side heuristics.
- This works reasonably for:
  - `piano`
  - `guitar`
- It is less exact when Klang returns a broader family part like:
  - `Wind`

## Best next step

- Move the visible score preview to a MusicXML-first render path.
- Keep Klang JSON for:
  - timing
  - cursor/playhead
  - tab positions
  - part selection
- Keep MIDI for:
  - synthesized playback

This is the cleanest path to making the preview match the Klang PDF/site output more closely.

## Current testing workflow

Use an existing multi-part Klang upload first. Re-upload is not required just to test parser or preview fixes.

### Recommended manual test steps

1. Open an existing uploaded track that has:
   - `KJSON`
   - `MusicXML`
   - `MIDI`
2. Click `Preview`
3. Switch instrument to `guitar`
4. Confirm source selection is sensible:
   - guitar should prefer `Klang JSON`
5. Compare:
   - preview
   - `Debug XML`
   - downloaded/opened PDF
6. Check:
   - tab numbers sit on string lines
   - notation and TAB do not overlap
   - tie timing feels less chopped
   - preview is closer to the PDF than before

## Verification completed today

- Focused tests passed:
  - `musicLibrary.utils.test.ts`
  - `musicPreview.utils.test.ts`
  - `klangioScore.test.ts`
- Full project build passed after the latest changes.

