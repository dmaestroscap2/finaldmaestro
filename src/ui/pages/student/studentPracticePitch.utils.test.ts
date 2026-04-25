import { describe, expect, it } from "vitest";
import {
  buildPracticeAudioConstraints,
  detectPitchHz,
  detectPitchHzWithConfig,
  frequencyToMidi,
  frequencyToPitch,
  stabiliseDetectedMidi,
} from "./studentPracticePitch.utils";

function createSineWaveBuffer(frequency: number, sampleRate: number, length: number): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

describe("studentPracticePitch utils", () => {
  it("detects a stable concert pitch from clean microphone data", () => {
    const sampleRate = 48_000;
    const buffer = createSineWaveBuffer(440, sampleRate, 4096);

    const frequency = detectPitchHz(buffer, sampleRate);

    expect(frequency).not.toBeNull();
    expect(frequency!).toBeGreaterThan(438);
    expect(frequency!).toBeLessThan(442);
    expect(frequencyToPitch(frequency)).toBe("A4");
  });

  it("supports configurable frequency windows for detection sensitivity", () => {
    const sampleRate = 48_000;
    const buffer = createSineWaveBuffer(440, sampleRate, 4096);

    expect(detectPitchHzWithConfig(buffer, sampleRate, { maxFrequencyHz: 300 })).toBeNull();
    expect(detectPitchHzWithConfig(buffer, sampleRate, { maxFrequencyHz: 500 })).not.toBeNull();
  });

  it("rejects silence-like buffers instead of inventing a pitch", () => {
    const sampleRate = 48_000;
    const buffer = new Float32Array(4096);

    expect(detectPitchHz(buffer, sampleRate)).toBeNull();
  });

  it("converts detected frequencies to rounded MIDI notes", () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(frequencyToMidi(261.63)).toBe(60);
    expect(frequencyToMidi(null)).toBeNull();
  });

  it("requires repeated frames before treating a detected pitch as stable", () => {
    expect(stabiliseDetectedMidi([], 69)).toEqual({ history: [69], stableMidi: null });
    expect(stabiliseDetectedMidi([69], 69)).toEqual({ history: [69, 69], stableMidi: 69 });
    expect(stabiliseDetectedMidi([69], 71)).toEqual({ history: [69, 71], stableMidi: null });
    expect(stabiliseDetectedMidi([69, 69], null)).toEqual({ history: [], stableMidi: null });
  });

  it("treats small semitone jitter across adjacent frames as a stable note", () => {
    expect(stabiliseDetectedMidi([69], 70)).toEqual({ history: [69, 70], stableMidi: 70 });
    expect(stabiliseDetectedMidi([70], 69)).toEqual({ history: [70, 69], stableMidi: 69 });
  });

  it("requests microphone constraints that avoid speech-oriented processing", () => {
    expect(buildPracticeAudioConstraints()).toEqual({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        latency: 0,
      },
    });
  });

  it("only requests optional constraints when the browser reports support", () => {
    expect(
      buildPracticeAudioConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: true,
        latency: true,
      } as MediaTrackSupportedConstraints)
    ).toEqual({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        latency: 0,
      },
    });
  });
});
