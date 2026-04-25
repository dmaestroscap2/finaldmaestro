/**
 * REAL Audio Processing Module
 * Uses actual pitch detection algorithms - NOT fake/mock data
 */

import { readFileSync } from 'fs';
import decode from 'audio-decode';
import type { ExtractedNote } from '../shared/schema';

// Note frequency mapping (A4 = 440Hz standard tuning)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
type NoteName = (typeof NOTE_NAMES)[number];
const A4_FREQUENCY = 440;
const A4_MIDI = 69;

/**
 * Convert frequency to note name and octave
 */
export function frequencyToNote(frequency: number): { note: NoteName; octave: number; cents: number } | null {
  if (frequency <= 0 || frequency < 20 || frequency > 5000) return null;

  // Calculate semitones from A4
  const semitones = 12 * Math.log2(frequency / A4_FREQUENCY);
  const midiNote = Math.round(A4_MIDI + semitones);
  const cents = Math.round((semitones - Math.round(semitones)) * 100);

  const noteIndex = ((midiNote % 12) + 12) % 12;
  const octave = Math.floor(midiNote / 12) - 1;

  return {
    note: NOTE_NAMES[noteIndex]!,
    octave,
    cents,
  };
}

/**
 * Convert note name to frequency
 */
export function noteToFrequency(noteName: string, octave: number): number {
  const normalized = noteName.replace('b', '#') as NoteName; // Handle flats
  const noteIndex = NOTE_NAMES.indexOf(normalized);
  if (noteIndex === -1) return 0;

  const midiNote = (octave + 1) * 12 + noteIndex;
  return A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI) / 12);
}

/**
 * Autocorrelation pitch detection (YIN-inspired)
 * This is a REAL algorithm, not mock data
 */
function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  const threshold = 0.1;

  // Calculate RMS to check if there's sound
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const s = buffer[i] ?? 0;
    rms += s * s;
  }
  rms = Math.sqrt(rms / SIZE);

  // Too quiet - no note detected
  if (rms < 0.01) return -1;

  // Autocorrelation
  const correlations = new Float32Array(MAX_SAMPLES);

  for (let lag = 0; lag < MAX_SAMPLES; lag++) {
    let sum = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      const a = buffer[i] ?? 0;
      const b = buffer[i + lag] ?? 0;
      sum += a * b;
    }
    correlations[lag] = sum;
  }

  // Find the first peak after the initial drop
  let foundPeak = false;
  let peakLag = -1;
  const c0 = correlations[0] ?? 0;

  for (let i = 1; i < MAX_SAMPLES - 1; i++) {
    const c = correlations[i] ?? 0;
    // Look for where correlation starts decreasing
    if (!foundPeak && c < c0 * (1 - threshold)) {
      foundPeak = true;
    }

    // Find the peak after the dip
    if (foundPeak && c > (correlations[i - 1] ?? 0) && c > (correlations[i + 1] ?? 0)) {
      peakLag = i;
      break;
    }
  }

  if (peakLag <= 0 || peakLag + 1 >= correlations.length) return -1;

  // Parabolic interpolation for sub-sample accuracy
  const y1 = correlations[peakLag - 1] ?? 0;
  const y2 = correlations[peakLag] ?? 0;
  const y3 = correlations[peakLag + 1] ?? 0;
  const denom = 2 * (y1 - 2 * y2 + y3);
  if (denom === 0) return -1;
  const refinedLag = peakLag + (y1 - y3) / denom;

  return sampleRate / refinedLag;
}

/**
 * Process audio buffer and extract notes
 * This uses REAL pitch detection, not random generation
 */
export async function extractNotesFromAudio(
  fileBuffer: Buffer
): Promise<{ notes: ExtractedNote[]; tempo: number; duration: number }> {
  // Decode audio file (MP3, WAV, etc.) to PCM samples
  const decodedAudio = (await decode(fileBuffer)) as any;

  const audioData: Float32Array =
    typeof decodedAudio?.getChannelData === 'function'
      ? (decodedAudio.getChannelData(0) as Float32Array)
      : ((decodedAudio?.channelData?.[0] as Float32Array | undefined) ?? new Float32Array());

  const sampleRate: number = typeof decodedAudio?.sampleRate === 'number' ? decodedAudio.sampleRate : 44_100;
  const duration: number =
    typeof decodedAudio?.duration === 'number' ? decodedAudio.duration : audioData.length / sampleRate;

  if (audioData.length === 0) {
    throw new Error('Failed to decode audio (no samples)');
  }

  const notes: ExtractedNote[] = [];
  const windowSize = 2048;
  const hopSize = 512;
  const minNoteDuration = 0.05; // 50ms minimum note

  let currentNote: { pitch: string; frequency: number; startTime: number; samples: number[] } | null = null;
  let lastPitch: string | null = null;
  let silenceCount = 0;
  const silenceThreshold = 3;

  // Process audio in windows
  for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
    const window = audioData.slice(i, i + windowSize);
    const time = i / sampleRate;

    // Detect pitch using autocorrelation
    const frequency = detectPitch(window, sampleRate);

    if (frequency > 60 && frequency < 2000) {
      const noteInfo = frequencyToNote(frequency);

      if (noteInfo) {
        const pitch = `${noteInfo.note}${noteInfo.octave}`;

        if (pitch !== lastPitch) {
          // Save previous note if long enough
          if (currentNote && (time - currentNote.startTime) >= minNoteDuration) {
            const avgFreq = currentNote.samples.reduce((a, b) => a + b, 0) / currentNote.samples.length;
            notes.push({
              pitch: currentNote.pitch,
              frequency: avgFreq,
              startTime: currentNote.startTime,
              duration: time - currentNote.startTime,
              velocity: 0.8,
              confidence: 0.9,
            });
          }

          // Start new note
          currentNote = {
            pitch,
            frequency,
            startTime: time,
            samples: [frequency],
          };
          lastPitch = pitch;
          silenceCount = 0;
        } else if (currentNote) {
          currentNote.samples.push(frequency);
        }
      }
    } else {
      silenceCount++;

      // End current note after silence
      if (silenceCount >= silenceThreshold && currentNote) {
        const endTime = time - (silenceCount * hopSize / sampleRate);
        if ((endTime - currentNote.startTime) >= minNoteDuration) {
          const avgFreq = currentNote.samples.reduce((a, b) => a + b, 0) / currentNote.samples.length;
          notes.push({
            pitch: currentNote.pitch,
            frequency: avgFreq,
            startTime: currentNote.startTime,
            duration: endTime - currentNote.startTime,
            velocity: 0.8,
            confidence: 0.85,
          });
        }
        currentNote = null;
        lastPitch = null;
      }
    }
  }

  // Don't forget the last note
  if (currentNote && (duration - currentNote.startTime) >= minNoteDuration) {
    const avgFreq = currentNote.samples.reduce((a, b) => a + b, 0) / currentNote.samples.length;
    notes.push({
      pitch: currentNote.pitch,
      frequency: avgFreq,
      startTime: currentNote.startTime,
      duration: duration - currentNote.startTime,
      velocity: 0.8,
      confidence: 0.85,
    });
  }

  // Estimate tempo from note onsets
  const tempo = estimateTempo(notes);

  console.log(`Extracted ${notes.length} REAL notes from ${duration.toFixed(1)}s audio (tempo: ${tempo} BPM)`);

  return { notes, tempo, duration };
}

/**
 * Estimate tempo from note onset times
 */
function estimateTempo(notes: ExtractedNote[]): number {
  if (notes.length < 4) return 120; // Default if too few notes

  // Calculate inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const cur = notes[i]!;
    const prev = notes[i - 1]!;
    const interval = cur.startTime - prev.startTime;
    if (interval > 0.1 && interval < 2) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return 120;

  // Find median interval (more robust than mean)
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)] ?? 0;
  if (medianInterval <= 0) return 120;

  // Convert to BPM (assuming quarter notes)
  const bpm = 60 / medianInterval;

  // Clamp to reasonable range
  return Math.round(Math.max(40, Math.min(200, bpm)));
}

/**
 * Transpose notes for different instruments
 */
export function transposeForInstrument(notes: ExtractedNote[], instrument: string): ExtractedNote[] {
  const transpositions: Record<string, number> = {
    piano: 0,
    guitar: 0,
    xylophone: 0,
    clarinet: 2,     // Bb instrument
    saxophone: -9,   // Eb alto sax
    trumpet: 2,      // Bb instrument
    trombone: 0,     // Concert pitch
    violin: 0,
    flute: 0,
  };

  const semitones = transpositions[instrument.toLowerCase()] || 0;
  if (semitones === 0) return notes;

  return notes.map((note) => {
    const noteInfo = frequencyToNote(note.frequency);
    if (!noteInfo) return note;

    const noteIndex = NOTE_NAMES.indexOf(noteInfo.note);
    if (noteIndex === -1) return note;
    let newIndex = noteIndex + semitones;
    let newOctave = noteInfo.octave;

    while (newIndex < 0) {
      newIndex += 12;
      newOctave--;
    }
    while (newIndex >= 12) {
      newIndex -= 12;
      newOctave++;
    }

    const newName = NOTE_NAMES[newIndex]!;
    const newPitch = `${newName}${newOctave}`;
    const newFrequency = noteToFrequency(newName, newOctave);

    return {
      ...note,
      pitch: newPitch,
      frequency: newFrequency,
    };
  });
}
