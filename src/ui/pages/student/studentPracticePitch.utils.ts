import { PitchDetector } from "pitchy";
import { midiToPitch } from "../musicPreview.utils";

export type PracticePitchDetectionConfig = {
  minFrequencyHz: number;
  maxFrequencyHz: number;
  minRms: number;
  minClarity: number;
};

export const DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG: PracticePitchDetectionConfig = {
  // Broad range to cover most instruments (A0..C8 and some harmonics).
  minFrequencyHz: 27.5,
  maxFrequencyHz: 4_500,
  // More sensitive defaults for quieter instruments / phone mics.
  minRms: 0.004,
  minClarity: 0.82,
};

const MIN_STABLE_FRAMES = 1;
const MAX_HISTORY = 4;
const STABLE_MIDI_TOLERANCE = 1;

const detectorCache = new Map<number, PitchDetector<Float32Array>>();

function getPitchyDetector(inputLength: number): PitchDetector<Float32Array> | null {
  if (!Number.isFinite(inputLength) || inputLength < 32) return null;
  const cached = detectorCache.get(inputLength);
  if (cached) return cached;
  const detector = PitchDetector.forFloat32Array(inputLength);
  detectorCache.set(inputLength, detector);
  return detector;
}

export function buildPracticeAudioConstraints(
  supportedConstraints?: MediaTrackSupportedConstraints
): MediaStreamConstraints {
  const supports = supportedConstraints ?? {};
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    // Helps quiet inputs register without users having to crank system gain.
    autoGainControl: true,
  };

  if (!supportedConstraints || supports.channelCount) audio.channelCount = 1;
  if (!supportedConstraints || (supports as any).latency) (audio as any).latency = 0;

  return { audio };
}

export function defaultPitchDetectionConfigForInstrument(
  instrument: string | null | undefined
): Partial<PracticePitchDetectionConfig> {
  const inst = String(instrument ?? "").trim().toLowerCase();

  const ranges: Record<string, { min: number; max: number; minClarity?: number }> = {
    // Keyboards / mallet
    piano: { min: 27.5, max: 4_500 },
    xylophone: { min: 200, max: 4_500, minClarity: 0.78 },

    // Strings
    guitar: { min: 70, max: 2_500, minClarity: 0.78 },
    bass: { min: 35, max: 1_500, minClarity: 0.78 },

    // Woodwinds
    clarinet: { min: 140, max: 3_500, minClarity: 0.8 },
    saxophone: { min: 90, max: 3_500, minClarity: 0.8 },

    // Brass
    trumpet: { min: 140, max: 3_500, minClarity: 0.82 },
    trombone: { min: 60, max: 2_800, minClarity: 0.8 },
    tuba: { min: 30, max: 1_800, minClarity: 0.78 },
    euphonium: { min: 45, max: 2_200, minClarity: 0.78 },
  };

  const match = ranges[inst];
  if (!match) return {};

  const out: Partial<PracticePitchDetectionConfig> = {
    minFrequencyHz: match.min,
    maxFrequencyHz: match.max,
  };
  if (typeof match.minClarity === "number") out.minClarity = match.minClarity;
  return out;
}

export function detectPitchHz(buffer: Float32Array, sampleRate: number): number | null {
  return detectPitchHzWithConfig(buffer, sampleRate, undefined);
}

export function detectPitchHzWithConfig(
  buffer: Float32Array,
  sampleRate: number,
  config: Partial<PracticePitchDetectionConfig> | undefined
): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || buffer.length < 32) return null;

  const cfg: PracticePitchDetectionConfig = { ...DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG, ...(config ?? {}) };

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i] ?? 0;
    rms += sample * sample;
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < cfg.minRms) return null;

  const detector = getPitchyDetector(buffer.length);
  if (!detector) return null;

  const [pitch, clarity] = detector.findPitch(buffer, sampleRate);
  if (!Number.isFinite(pitch) || !Number.isFinite(clarity)) return null;
  if (clarity < cfg.minClarity) return null;
  if (pitch < cfg.minFrequencyHz || pitch > cfg.maxFrequencyHz) return null;

  return pitch;
}

export function frequencyToMidi(frequency: number | null): number | null {
  if (frequency == null || !Number.isFinite(frequency) || frequency <= 0) return null;
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function frequencyToPitch(frequency: number | null): string | null {
  const midi = frequencyToMidi(frequency);
  return midi == null ? null : midiToPitch(midi);
}

export function stabiliseDetectedMidi(
  history: number[],
  midi: number | null
): { history: number[]; stableMidi: number | null } {
  if (midi == null) return { history: [], stableMidi: null };

  const nextHistory = [...history, midi].slice(-MAX_HISTORY);
  const recent = nextHistory.slice(-MIN_STABLE_FRAMES);
  const stable =
    recent.length >= MIN_STABLE_FRAMES &&
    recent.every((value) => Math.abs(value - midi) <= STABLE_MIDI_TOLERANCE);

  return {
    history: nextHistory,
    stableMidi: stable ? midi : null,
  };
}
