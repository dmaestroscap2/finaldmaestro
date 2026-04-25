export function apiOriginFromBase(apiBase: string): string {
  // API base is like http://localhost:3001/api
  try {
    const u = new URL(apiBase);
    return u.origin;
  } catch {
    return "";
  }
}

export function resolveAudioUrl(apiBase: string, audioPath: string | null | undefined): string | null {
  if (!audioPath) return null;
  if (audioPath.startsWith("http://") || audioPath.startsWith("https://")) return audioPath;
  const origin = apiOriginFromBase(apiBase);
  if (!origin) return null;
  if (audioPath.startsWith("/")) return `${origin}${audioPath}`;
  return `${origin}/${audioPath}`;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
type NoteName = (typeof NOTE_NAMES)[number];
const DIATONIC_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;
type DiatonicName = (typeof DIATONIC_NAMES)[number];

export function pitchToMidi(pitch: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(pitch.trim());
  if (!m) return null;
  const letter = m[1]!;
  const accidental = m[2] ?? "";
  const octave = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(octave)) return null;

  const name = (letter + accidental).replace("Db", "C#").replace("Eb", "D#").replace("Gb", "F#").replace("Ab", "G#").replace("Bb", "A#");
  if (!NOTE_NAMES.includes(name as NoteName)) return null;
  const noteIndex = NOTE_NAMES.indexOf(name as NoteName);
  return (octave + 1) * 12 + noteIndex;
}

export function midiToPitch(midi: number): string {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]!}${octave}`;
}

export function transposePitch(pitch: string, semitones: number): string | null {
  const midi = pitchToMidi(pitch);
  if (midi == null) return null;
  return midiToPitch(midi + semitones);
}

export function transpositionForInstrument(instrument: string | null | undefined): number {
  const inst = (instrument ?? "").toLowerCase();
  // Written-pitch display shift (semitones) to match common notation conventions.
  // Notes we get from Klang JSON/MIDI are in sounding pitch; for some instruments the staff is written transposed.
  // For example, guitar/bass are typically written one octave higher than they sound.
  const map: Record<string, number> = {
    piano: 0,
    guitar: 12,
    bass: 12,
    clarinet: 2,
    saxophone: 9,
    trumpet: 2,
    trombone: 0,
    xylophone: -12,
  };
  return map[inst] ?? 0;
}

export type PreviewClef = "treble" | "bass";

export function previewClefForInstrument(instrument: string | null | undefined): PreviewClef {
  const inst = (instrument ?? "").toLowerCase();
  if (inst === "trombone" || inst === "bass") return "bass";
  return "treble";
}

export function previewClefSymbol(clef: PreviewClef): string {
  return clef === "bass" ? "\uD834\uDD22" : "\uD834\uDD1E";
}

export type NoteEventLike = {
  pitch?: string;
  startTime?: number;
  duration?: number;
  velocity?: number;
};

export type PitchDisplay = "sounding" | "written";

export type NoteLaneGlyph = {
  x: number;
  y: number;
  midi: number;
  staffStep: number;
  displayPitch: string;
  ledgerLineYs: number[];
  startTime: number;
  duration: number;
  isActive: boolean;
  noteIndex: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parsePitchParts(pitch: string): { name: DiatonicName; octave: number } | null {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(pitch.trim());
  if (!m) return null;
  const name = m[1] as DiatonicName;
  const octave = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(octave)) return null;
  return { name, octave };
}

function diatonicPitchNumber(pitch: string): number | null {
  const parts = parsePitchParts(pitch);
  if (!parts) return null;
  const noteIndex = DIATONIC_NAMES.indexOf(parts.name);
  if (noteIndex < 0) return null;
  return parts.octave * 7 + noteIndex;
}

function clefBottomLinePitch(clef: PreviewClef): string {
  return clef === "bass" ? "G2" : "E4";
}

function pitchToStaffStep(pitch: string, clef: PreviewClef): number | null {
  const diatonic = diatonicPitchNumber(pitch);
  const bottomLine = diatonicPitchNumber(clefBottomLinePitch(clef));
  if (diatonic == null || bottomLine == null) return null;
  return diatonic - bottomLine;
}

function staffStepToY(staffStep: number, staffLineYs: number[]): number {
  const bottomLineY = staffLineYs[staffLineYs.length - 1] ?? 146;
  const lineSpacing = Math.abs((staffLineYs[1] ?? 98) - (staffLineYs[0] ?? 82)) || 16;
  return bottomLineY - staffStep * (lineSpacing / 2);
}

function staffStepToLedgerLineYs(staffStep: number, staffLineYs: number[]): number[] {
  const out: number[] = [];
  if (staffStep < 0) {
    for (let step = -2; step >= staffStep; step -= 2) {
      out.push(staffStepToY(step, staffLineYs));
    }
    return out;
  }

  if (staffStep > 8) {
    for (let step = 10; step <= staffStep; step += 2) {
      out.push(staffStepToY(step, staffLineYs));
    }
  }

  return out;
}

export function computeNoteLaneGlyphs(params: {
  notes: NoteEventLike[];
  currentTime: number;
  instrument: string | null | undefined;
  pitchDisplay?: PitchDisplay;
  viewWidth: number;
  playheadX: number;
  pxPerSecond: number;
  staffLineYs: number[];
  xMargin?: number;
}): NoteLaneGlyph[] {
  const xMargin = typeof params.xMargin === "number" ? params.xMargin : 40;
  const currentTime = Number.isFinite(params.currentTime) ? Math.max(0, params.currentTime) : 0;
  const pitchDisplay: PitchDisplay = params.pitchDisplay ?? "written";
  const semitones = pitchDisplay === "written" ? transpositionForInstrument(params.instrument) : 0;
  const clef = previewClefForInstrument(params.instrument);

  const out: NoteLaneGlyph[] = [];
  for (let noteIndex = 0; noteIndex < params.notes.length; noteIndex++) {
    const n = params.notes[noteIndex]!;
    const st = typeof n.startTime === "number" && Number.isFinite(n.startTime) ? n.startTime : null;
    const dur = typeof n.duration === "number" && Number.isFinite(n.duration) ? n.duration : 0.1;
    const pitch = typeof n.pitch === "string" ? n.pitch : null;
    if (st == null || !pitch) continue;

    const playedPitch = semitones !== 0 ? transposePitch(pitch, semitones) : pitch;
    if (!playedPitch) continue;

    const midi = pitchToMidi(playedPitch);
    if (midi == null) continue;
    const staffStep = pitchToStaffStep(playedPitch, clef);
    if (staffStep == null) continue;

    const x = params.playheadX + (st - currentTime) * params.pxPerSecond;
    if (x < -xMargin || x > params.viewWidth + xMargin) continue;

    const y = staffStepToY(staffStep, params.staffLineYs);
    const ledgerLineYs = staffStepToLedgerLineYs(staffStep, params.staffLineYs);
    const isActive = currentTime >= st && currentTime <= st + Math.max(0.01, dur);

    out.push({
      x,
      y,
      midi,
      staffStep,
      displayPitch: playedPitch,
      ledgerLineYs,
      startTime: st,
      duration: Math.max(0.01, dur),
      isActive,
      noteIndex,
    });
  }

  // Stable ordering to avoid React reordering jitter.
  out.sort((a, b) => a.startTime - b.startTime || a.staffStep - b.staffStep || a.midi - b.midi);
  return out;
}

export type TabEventLike = {
  startTime?: number;
  duration?: number;
  string?: number; // 1..6 (1 = high string)
  fret?: number;
};

export type TabLaneGlyph = {
  x: number;
  lineY: number;
  textY: number;
  fret: number;
  startTime: number;
  duration: number;
  isActive: boolean;
  key: string;
};

export function computeTabLaneGlyphs(params: {
  tabEvents: TabEventLike[];
  measureStarts: number[];
  currentTime: number;
  viewWidth: number;
  playheadX: number;
  pxPerSecond: number;
  xMargin?: number;
  yTop: number;
  spacing: number;
}): { glyphs: TabLaneGlyph[]; barlines: number[] } {
  const xMargin = typeof params.xMargin === "number" ? params.xMargin : 40;
  const currentTime = Number.isFinite(params.currentTime) ? Math.max(0, params.currentTime) : 0;

  const out: TabLaneGlyph[] = [];
  for (const ev of params.tabEvents) {
    const st = typeof ev.startTime === "number" && Number.isFinite(ev.startTime) ? ev.startTime : null;
    const dur = typeof ev.duration === "number" && Number.isFinite(ev.duration) ? ev.duration : 0.1;
    const str = typeof ev.string === "number" && Number.isFinite(ev.string) ? ev.string : null;
    const fret = typeof ev.fret === "number" && Number.isFinite(ev.fret) ? ev.fret : null;
    if (st == null || str == null || fret == null) continue;

    const x = params.playheadX + (st - currentTime) * params.pxPerSecond;
    if (x < -xMargin || x > params.viewWidth + xMargin) continue;

    // Klang uses 1..6 (1 = high string). Render top-to-bottom as 1..6.
    const clampedString = Math.max(1, Math.min(6, Math.round(str)));
    const lineY = params.yTop + (clampedString - 1) * params.spacing;

    // Place text directly on the string line (the line passes through the glyph).
    const textY = lineY;

    const isActive = currentTime >= st && currentTime <= st + Math.max(0.01, dur);
    out.push({
      x,
      lineY,
      textY,
      fret: Math.round(fret),
      startTime: st,
      duration: dur,
      isActive,
      key: `${st}-${clampedString}-${Math.round(fret)}`,
    });
  }

  // Force same-time events to align to the exact same x (chord stacks).
  out.sort((a, b) => a.x - b.x || a.lineY - b.lineY);
  const epsPx = 1.5;
  let lastX = Number.NaN;
  for (const g of out) {
    if (!Number.isFinite(lastX)) {
      lastX = g.x;
      continue;
    }
    if (Math.abs(g.x - lastX) <= epsPx) {
      g.x = lastX;
    } else {
      lastX = g.x;
    }
  }

  const barlines = params.measureStarts
    .filter((t) => typeof t === "number" && Number.isFinite(t))
    .map((t) => params.playheadX + (t - currentTime) * params.pxPerSecond)
    .filter((x) => x >= -xMargin && x <= params.viewWidth + xMargin);

  return { glyphs: out, barlines };
}
