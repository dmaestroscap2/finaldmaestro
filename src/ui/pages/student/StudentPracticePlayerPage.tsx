import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { assignmentAPI, authAPI, musicAPI, sessionAPI } from "../../../api/client";
import { choosePreviewNoteSource } from "../musicLibrary.utils";
import {
  computeNoteLaneGlyphs,
  computeTabLaneGlyphs,
  previewClefForInstrument,
  previewClefSymbol,
  pitchToMidi,
  transposePitch,
  transpositionForInstrument,
  type PitchDisplay,
} from "../musicPreview.utils";
import { createInstrumentSynth } from "../instrumentSynth.utils";
import {
  advanceMissedNotes,
  evaluateDetectedPracticeFrame,
  getExpectedNoteIndex,
  gradeTimingAgainstNoteStart,
  pitchesMatchWithConfig,
  summarisePracticeStatuses,
  DEFAULT_PRACTICE_SCORING_CONFIG,
  type PracticeScoringConfig,
  type PracticeExpectedNote,
  type PracticeNoteStatus,
} from "./studentPracticeSession.utils";
import {
  buildPracticeAudioConstraints,
  defaultPitchDetectionConfigForInstrument,
  detectPitchHzWithConfig,
  DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG,
  frequencyToMidi,
  frequencyToPitch,
  stabiliseDetectedMidi,
} from "./studentPracticePitch.utils";
import {
  buildPracticeOutcome,
  summariseTimingGrades,
  type PracticeTimingGrade,
} from "./studentPracticePolicy.utils";
import {
  clampPracticePlaybackRate,
  DEFAULT_PRACTICE_PLAYBACK_RATE,
  formatPracticePlaybackRate,
} from "./studentPracticePlayback.utils";
import {
  buildRemainingPracticeNotes,
  computePracticeMediaElapsed,
  resolvePracticePlaybackSource,
} from "./studentPracticeProcessedPlayback.utils";
import { buildPracticeSheetLayout } from "./studentPracticeLayout.utils";
import { extractPracticeTabData } from "./studentPracticePreview.utils";
import { resolveStudentPracticeInstrument } from "./studentPracticeInstrument.utils";
import { formatPracticeMusicalLabel } from "./studentPracticeLabel.utils";

type AssignmentWithMusic = {
  id: number;
  musicSheet?: {
    id?: number;
    title?: string | null;
    artist?: string | null;
    duration?: number | null;
    audioPath?: string | null;
    notes?: PracticeExpectedNote[];
    klangioJson?: string | null;
    klangioMidiQuantPath?: string | null;
  } | null;
};

export function StudentPracticePlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const assignmentId = Number.parseInt(searchParams.get("assignmentId") ?? "0", 10);
  const fallbackTitle = searchParams.get("musicTitle") ?? searchParams.get("title") ?? "Practice";
  const fallbackArtist = searchParams.get("musicArtist") ?? searchParams.get("subtitle") ?? "Unknown";
  const requestedInstrument = searchParams.get("instrument");
  const debugPractice = String(searchParams.get("debugPractice") ?? "").trim() === "true";

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [assignment, setAssignment] = React.useState<AssignmentWithMusic | null>(null);
  const [title, setTitle] = React.useState(fallbackTitle);
  const [artist, setArtist] = React.useState(fallbackArtist);
  const [instrument, setInstrument] = React.useState(resolveStudentPracticeInstrument(requestedInstrument, null));
  const [expectedNotes, setExpectedNotes] = React.useState<PracticeExpectedNote[]>([]);
  const [tabEvents, setTabEvents] = React.useState<Array<{ startTime?: number; duration?: number; string?: number; fret?: number }>>([]);
  const [tabMeasureStarts, setTabMeasureStarts] = React.useState<number[]>([]);
  const [noteStatuses, setNoteStatuses] = React.useState<PracticeNoteStatus[]>([]);
  const [timingGrades, setTimingGrades] = React.useState<Array<PracticeTimingGrade | null>>([]);
  const [heldDurations, setHeldDurations] = React.useState<number[]>([]);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [micStatus, setMicStatus] = React.useState<"idle" | "requesting" | "ready" | "denied" | "unsupported">("idle");
  const [playedPitch, setPlayedPitch] = React.useState<string | null>(null);
  const [pitchDisplay, setPitchDisplay] = React.useState<PitchDisplay>("sounding");
  const [playedFrequency, setPlayedFrequency] = React.useState<number | null>(null);
  const [currentExpectedIndex, setCurrentExpectedIndex] = React.useState(-1);
  const [playbackRate, setPlaybackRate] = React.useState(DEFAULT_PRACTICE_PLAYBACK_RATE);
  const [transposeSemitones, setTransposeSemitones] = React.useState(0);
  const [isProcessedPlaybackActive, setIsProcessedPlaybackActive] = React.useState(false);
  const [hasCompletedMicCheck, setHasCompletedMicCheck] = React.useState(false);
  const [micSignalDetected, setMicSignalDetected] = React.useState(false);
  const [micDeviceLabel, setMicDeviceLabel] = React.useState("");
  const [lastOutcome, setLastOutcome] = React.useState<ReturnType<typeof buildPracticeOutcome> | null>(null);

  const statusesRef = React.useRef<PracticeNoteStatus[]>([]);
  const notesRef = React.useRef<PracticeExpectedNote[]>([]);
  const elapsedRef = React.useRef(0);
  const timingGradesRef = React.useRef<Array<PracticeTimingGrade | null>>([]);
  const heldDurationsRef = React.useRef<number[]>([]);
  const isRunningRef = React.useRef(false);
  const mediaElapsedBaseRef = React.useRef(0);
  const mediaPerfStartRef = React.useRef<number | null>(null);
  const playbackRateRef = React.useRef(DEFAULT_PRACTICE_PLAYBACK_RATE);
  const animationFrameRef = React.useRef<number | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const detectionIntervalRef = React.useRef<number | null>(null);
  const debugFrameRef = React.useRef(0);
  const midiHistoryRef = React.useRef<number[]>([]);
  const synthRef = React.useRef<any | null>(null);
  const synthStopTimerRef = React.useRef<number | null>(null);
  const toneRef = React.useRef<any | null>(null);
  const processedBaseToneSecRef = React.useRef<number | null>(null);

  const expectedNotesTransposed = React.useMemo(() => {
    const shift = Number.isFinite(transposeSemitones) ? Math.max(-24, Math.min(24, Math.trunc(transposeSemitones))) : 0;
    if (shift === 0) return expectedNotes;
    return expectedNotes.map((n) => {
      const pitch = typeof n?.pitch === "string" ? n.pitch : null;
      if (!pitch) return n;
      const next = transposePitch(pitch, shift);
      if (!next) return n;
      return { ...n, pitch: next };
    });
  }, [expectedNotes, transposeSemitones]);

  const tabEventsTransposed = React.useMemo(() => {
    const inst = instrument.toLowerCase();
    const shift = Number.isFinite(transposeSemitones) ? Math.max(-24, Math.min(24, Math.trunc(transposeSemitones))) : 0;
    if (inst !== "guitar" || shift === 0) return tabEvents;
    return tabEvents.map((ev: any) => {
      const fret = typeof ev?.fret === "number" && Number.isFinite(ev.fret) ? ev.fret : null;
      if (fret == null) return ev;
      const nextFret = Math.max(0, Math.min(24, Math.round(fret + shift)));
      return { ...ev, fret: nextFret };
    });
  }, [tabEvents, instrument, transposeSemitones]);

  React.useEffect(() => {
    notesRef.current = expectedNotesTransposed;
  }, [expectedNotesTransposed]);

  React.useEffect(() => {
    statusesRef.current = noteStatuses;
  }, [noteStatuses]);

  React.useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  React.useEffect(() => {
    timingGradesRef.current = timingGrades;
  }, [timingGrades]);

  React.useEffect(() => {
    heldDurationsRef.current = heldDurations;
  }, [heldDurations]);

  React.useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const playbackSource = React.useMemo(
    () => resolvePracticePlaybackSource(expectedNotesTransposed),
    [expectedNotesTransposed]
  );

  const totalDuration = React.useMemo(() => {
    const notesEnd = expectedNotes.reduce((max, note) => {
      const start = typeof note.startTime === "number" ? note.startTime : 0;
      const duration = typeof note.duration === "number" ? note.duration : 0;
      return Math.max(max, start + duration);
    }, 0);
    const assignmentDuration = Number(assignment?.musicSheet?.duration ?? 0);
    return Math.max(notesEnd, Number.isFinite(assignmentDuration) ? assignmentDuration : 0);
  }, [assignment, expectedNotes]);

  const previewClef = React.useMemo(() => previewClefForInstrument(instrument), [instrument]);
  const previewHasTabLane = instrument.toLowerCase() === "guitar" && tabEvents.length > 0;
  const practiceSheetLayout = React.useMemo(
    () => buildPracticeSheetLayout(previewHasTabLane),
    [previewHasTabLane]
  );

  const [sheetPanSec, setSheetPanSec] = React.useState(0);
  const [isSheetDragging, setIsSheetDragging] = React.useState(false);
  const sheetDragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startPan: number;
  } | null>(null);

  React.useEffect(() => {
    // Reset any manual panning when the assignment changes.
    setSheetPanSec(0);
    setIsSheetDragging(false);
    sheetDragRef.current = null;
  }, [assignmentId]);

  React.useEffect(() => {
    if (!isRunning && !lastOutcome) return;
    setIsSheetDragging(false);
    sheetDragRef.current = null;
  }, [isRunning, lastOutcome]);

  const sheetPreviewTime = React.useMemo(() => {
    if (isRunning) return elapsedSec;
    const t = Number(elapsedSec) + Number(sheetPanSec);
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.min(totalDuration, t));
  }, [elapsedSec, sheetPanSec, totalDuration, isRunning]);

  const laneGlyphs = React.useMemo(() => {
    return computeNoteLaneGlyphs({
      notes: expectedNotesTransposed,
      currentTime: sheetPreviewTime,
      instrument,
      pitchDisplay,
      viewWidth: 1000,
      playheadX: practiceSheetLayout.playheadX,
      pxPerSecond: 130,
      staffLineYs: practiceSheetLayout.staffLineYs,
      xMargin: 100,
    });
  }, [expectedNotesTransposed, sheetPreviewTime, instrument, pitchDisplay, practiceSheetLayout]);

  const expectedNotesForProcessedPlayback = React.useMemo(() => {
    if (pitchDisplay !== "written") return expectedNotesTransposed;
    const semitones = transpositionForInstrument(instrument);
    if (semitones === 0) return expectedNotesTransposed;
    return expectedNotesTransposed.map((note) => {
      const pitch = typeof note?.pitch === "string" ? note.pitch : null;
      if (!pitch) return note;
      const shifted = transposePitch(pitch, semitones);
      return shifted ? { ...note, pitch: shifted } : note;
    });
  }, [expectedNotesTransposed, instrument, pitchDisplay]);
  const practiceTabGlyphs = React.useMemo(() => {
    if (!previewHasTabLane) return { glyphs: [], barlines: [] };
    return computeTabLaneGlyphs({
      tabEvents: tabEventsTransposed,
      measureStarts: tabMeasureStarts,
      currentTime: sheetPreviewTime,
      viewWidth: 1000,
      playheadX: practiceSheetLayout.playheadX,
      pxPerSecond: 130,
      xMargin: 100,
      yTop: practiceSheetLayout.tabYTop,
      spacing: practiceSheetLayout.tabSpacing,
    });
  }, [previewHasTabLane, tabEventsTransposed, tabMeasureStarts, sheetPreviewTime, practiceSheetLayout]);

  const statusFill = React.useCallback((status: PracticeNoteStatus) => {
    if (status === "correct") return "rgba(95,214,156,.92)"; // green
    if (status === "incorrect") return "rgba(255,120,120,.95)"; // red
    if (status === "missed") return "rgba(241,194,75,.95)"; // yellow
    return "rgba(216,221,231,.55)"; // default gray
  }, []);

  const statusStroke = React.useCallback((status: PracticeNoteStatus) => {
    if (status === "correct") return "rgba(95,214,156,.55)";
    if (status === "incorrect") return "rgba(255,120,120,.55)";
    if (status === "missed") return "rgba(241,194,75,.55)";
    return "rgba(216,221,231,.25)";
  }, []);

  const tabStatusByKey = React.useMemo(() => {
    if (!previewHasTabLane || practiceTabGlyphs.glyphs.length === 0) return new Map<string, PracticeNoteStatus>();

    // Map tab glyphs -> expected note indices by start time. This is a best-effort alignment for chords.
    const byStart = new Map<number, number[]>();
    for (let i = 0; i < expectedNotesTransposed.length; i++) {
      const st = expectedNotesTransposed[i]?.startTime;
      if (typeof st !== "number" || !Number.isFinite(st)) continue;
      const key = Math.round(st * 100); // centiseconds
      const list = byStart.get(key) ?? [];
      list.push(i);
      byStart.set(key, list);
    }
    for (const list of byStart.values()) list.sort((a, b) => a - b);

    const used = new Set<number>();
    const out = new Map<string, PracticeNoteStatus>();

    for (const glyph of practiceTabGlyphs.glyphs) {
      const baseKey = Math.round(glyph.startTime * 100);
      const candidateKeys = [baseKey, baseKey - 1, baseKey + 1];
      let matchedIndex: number | null = null;

      for (const k of candidateKeys) {
        const list = byStart.get(k);
        if (!list || list.length === 0) continue;
        const found = list.find((idx) => !used.has(idx));
        if (typeof found === "number") {
          matchedIndex = found;
          used.add(found);
          break;
        }
      }

      if (matchedIndex == null) {
        out.set(glyph.key, "pending");
        continue;
      }
      out.set(glyph.key, noteStatuses[matchedIndex] ?? "pending");
    }

    return out;
  }, [expectedNotesTransposed, noteStatuses, practiceTabGlyphs.glyphs, previewHasTabLane]);

  const summary = React.useMemo(() => summarisePracticeStatuses(noteStatuses), [noteStatuses]);
  const wrongNotes = summary.incorrectNotes;
  const timingSummary = React.useMemo(() => summariseTimingGrades(timingGrades), [timingGrades]);
  const liveOutcome = React.useMemo(
    () =>
      buildPracticeOutcome({
        totalNotes: summary.totalNotes,
        correctNotes: summary.correctNotes,
        missedNotes: summary.missedNotes,
        wrongNotes,
        timingGrades,
      }),
    [summary, wrongNotes, timingGrades]
  );
  const accuracyScore = liveOutcome.accuracyScore;
  const timingScore = liveOutcome.timingScore;
  const progress = totalDuration > 0 ? Math.min(100, Math.round((elapsedSec / totalDuration) * 100)) : 0;
  const score = summary.correctNotes * 10;
  const currentExpectedPitch =
    currentExpectedIndex >= 0 ? String(expectedNotesTransposed[currentExpectedIndex]?.pitch ?? "-") : "-";
  const displaySemitones = pitchDisplay === "written" ? transpositionForInstrument(instrument) : 0;
  const displayedExpectedPitch =
    displaySemitones !== 0 ? transposePitch(currentExpectedPitch, displaySemitones) ?? currentExpectedPitch : currentExpectedPitch;
  const displayedPlayedPitch =
    displaySemitones !== 0 && playedPitch ? transposePitch(playedPitch, displaySemitones) ?? playedPitch : playedPitch;

  const currentExpectedLabel = formatPracticeMusicalLabel(displayedExpectedPitch === "-" ? "" : displayedExpectedPitch, instrument) || "-";
  const playedPitchLabel = formatPracticeMusicalLabel(displayedPlayedPitch, instrument) || "-";

  const scoringConfig = React.useMemo<PracticeScoringConfig>(() => {
    const pitchTol = Number.parseFloat(String(searchParams.get("pitchTol") ?? ""));
    const noteWindow = Number.parseFloat(String(searchParams.get("noteWindow") ?? ""));
    const minHold = Number.parseFloat(String(searchParams.get("minHold") ?? ""));

    return {
      ...DEFAULT_PRACTICE_SCORING_CONFIG,
      pitchToleranceSemitones: Number.isFinite(pitchTol)
        ? Math.max(0, Math.min(12, pitchTol))
        : DEFAULT_PRACTICE_SCORING_CONFIG.pitchToleranceSemitones,
      noteWindowSec: Number.isFinite(noteWindow)
        ? Math.max(0.05, Math.min(1.0, noteWindow))
        : DEFAULT_PRACTICE_SCORING_CONFIG.noteWindowSec,
      minHoldSec: Number.isFinite(minHold)
        ? Math.max(0.02, Math.min(0.2, minHold))
        : DEFAULT_PRACTICE_SCORING_CONFIG.minHoldSec,
    };
  }, [searchParams]);

  const realtimeFeedback = React.useMemo(() => {
    const expected = currentExpectedPitch !== "-" ? currentExpectedPitch : null;
    const played = playedPitch ?? null;
    const expectedNote = currentExpectedIndex >= 0 ? expectedNotesTransposed[currentExpectedIndex] : null;
    const status = currentExpectedIndex >= 0 ? noteStatuses[currentExpectedIndex] ?? "pending" : "pending";

    const expectedMidi = expected ? pitchToMidi(expected) : null;
    const expectedHz = expectedMidi == null ? null : 440 * Math.pow(2, (expectedMidi - 69) / 12);
    const playedHz = playedFrequency != null && Number.isFinite(playedFrequency) ? playedFrequency : null;

    const cents =
      expectedHz && playedHz && expectedHz > 0 && playedHz > 0
        ? Math.round(1200 * Math.log2(playedHz / expectedHz))
        : null;

    const pitchMatch =
      expected && played ? pitchesMatchWithConfig(expected, played, scoringConfig) : false;

    const pitchLabel = (() => {
      if (!expected || !played) return { label: "Pitch: —", color: "rgba(216,221,231,.70)" };
      if (!Number.isFinite(cents ?? NaN)) {
        return { label: pitchMatch ? "Pitch: OK" : "Pitch: Off", color: pitchMatch ? "rgba(241,194,75,.95)" : "rgba(255,120,120,.92)" };
      }
      const abs = Math.abs(Number(cents ?? 0));
      const tuneState = abs <= 25 ? "OK" : cents! > 0 ? "Sharp" : "Flat";
      const base = `Pitch: ${tuneState} (${cents! > 0 ? "+" : ""}${cents}c)`;
      const color = abs <= 25 ? "rgba(241,194,75,.95)" : "rgba(255,120,120,.92)";
      return { label: base, color };
    })();

    const timingGrade = expectedNote
      ? gradeTimingAgainstNoteStart(expectedNote, elapsedSec, scoringConfig)
      : null;

    const timingLabel = (() => {
      if (!expected) return { label: "Timing: —", color: "rgba(216,221,231,.70)" };
      if (!timingGrade) return { label: "Timing: —", color: "rgba(216,221,231,.70)" };
      if (timingGrade === "perfect") return { label: "Timing: Perfect", color: "rgba(241,194,75,.95)" };
      if (timingGrade === "early") return { label: "Timing: Early", color: "rgba(126,168,255,.88)" };
      return { label: "Timing: Late", color: "rgba(255,120,120,.88)" };
    })();

    const noteLabel = (() => {
      if (currentExpectedIndex < 0 || !expected) return { label: "Note: —", color: "rgba(216,221,231,.70)" };
      if (status === "correct") return { label: "Note: Correct", color: "rgba(241,194,75,.95)" };
      if (status === "incorrect") return { label: "Note: Wrong", color: "rgba(255,120,120,.92)" };
      if (status === "missed") return { label: "Note: Missed", color: "rgba(241,194,75,.70)" };
      return { label: "Note: Pending", color: "rgba(216,221,231,.70)" };
    })();

    return { pitchLabel, timingLabel, noteLabel };
  }, [
    currentExpectedPitch,
    currentExpectedIndex,
    expectedNotesTransposed,
    noteStatuses,
    playedFrequency,
    playedPitch,
    elapsedSec,
    scoringConfig,
  ]);

  const postSessionSuggestions = React.useMemo(() => {
    if (!lastOutcome) return [];

    const total = Math.max(0, Number(summary.totalNotes ?? 0));
    const missed = Math.max(0, Number(summary.missedNotes ?? 0));
    const wrong = Math.max(0, Number(wrongNotes ?? 0));
    const correct = Math.max(0, Number(summary.correctNotes ?? 0));
    const perfect = Math.max(0, Number(lastOutcome.timingSummary?.perfect ?? 0));
    const early = Math.max(0, Number(lastOutcome.timingSummary?.early ?? 0));
    const late = Math.max(0, Number(lastOutcome.timingSummary?.late ?? 0));

    const tips: string[] = [];

    if (total > 0) {
      const missedPct = Math.round((missed / total) * 100);
      const wrongPct = Math.round((wrong / total) * 100);

      if (lastOutcome.accuracyScore < 70) {
        tips.push(`Accuracy is ${lastOutcome.accuracyScore}%. Slow down and focus on clean note hits first (aim to reduce missed and wrong notes).`);
      }

      if (missedPct >= 25) {
        tips.push(`You missed ${missedPct}% of the notes. Try practicing shorter sections and watch the EXPECTED note as you play.`);
      }

      if (wrongPct >= 20) {
        tips.push(`You played wrong notes ${wrongPct}% of the time. Try holding each note a bit longer and match the displayed pitch before moving on.`);
      }

      if (lastOutcome.timingScore < 60) {
        tips.push(`Timing is ${lastOutcome.timingScore}%. Use a steady tempo and aim for more Perfect hits.`);
      }

      if (early + late > perfect && total >= 8) {
        if (early > late * 1.2) tips.push("You tend to play early. Try waiting for the note start before attacking.");
        else if (late > early * 1.2) tips.push("You tend to play late. Try anticipating the note start slightly.");
        else tips.push("Timing is inconsistent. Try practicing with a slower tempo and focus on landing note starts.");
      }

      // Surface the top trouble pitches (missed/incorrect).
      const troubleMap = new Map<string, number>();
      for (let i = 0; i < noteStatuses.length; i++) {
        const status = noteStatuses[i];
        if (status !== "missed" && status !== "incorrect") continue;
        const pitch = String(expectedNotesTransposed[i]?.pitch ?? "").trim();
        if (!pitch) continue;
        troubleMap.set(pitch, (troubleMap.get(pitch) ?? 0) + 1);
      }
      const topTrouble = Array.from(troubleMap.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([pitch, count]) => `${pitch} (${count})`);
      if (topTrouble.length > 0) {
        tips.push(`Trouble notes: ${topTrouble.join(", ")}. Repeat these slowly until they feel comfortable.`);
      }

      if (correct === 0 && total > 0) {
        tips.push("No correct notes were recorded. Check your microphone input and try playing a single stable note first.");
      }
    }

    if (tips.length === 0) {
      tips.push("Good work. Try another session and aim to increase both Accuracy and Timing.");
    }

    return tips;
  }, [lastOutcome, expectedNotesTransposed, noteStatuses, summary, wrongNotes]);

  const pitchDetectionConfig = React.useMemo(() => {
    const minClarity = Number.parseFloat(String(searchParams.get("minClarity") ?? ""));
    const minRms = Number.parseFloat(String(searchParams.get("minRms") ?? ""));
    return {
      ...DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG,
      ...defaultPitchDetectionConfigForInstrument(instrument),
      minClarity: Number.isFinite(minClarity)
        ? Math.max(0.5, Math.min(0.99, minClarity))
        : DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG.minClarity,
      minRms: Number.isFinite(minRms)
        ? Math.max(0.001, Math.min(0.05, minRms))
        : DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG.minRms,
    };
  }, [instrument, searchParams]);

  const stopMicrophone = React.useCallback(async () => {
    if (detectionIntervalRef.current != null) {
      window.clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) track.stop();
      micStreamRef.current = null;
    }
    midiHistoryRef.current = [];
    setPlayedPitch(null);
    setPlayedFrequency(null);
  }, []);

  const stopProcessedPlayback = React.useCallback(async () => {
    if (synthStopTimerRef.current != null) {
      window.clearTimeout(synthStopTimerRef.current);
      synthStopTimerRef.current = null;
    }
    if (synthRef.current) {
      try {
        synthRef.current.dispose?.();
      } catch {
        // ignore
      }
      synthRef.current = null;
    }
    try {
      const Tone = await import("tone");
      Tone.Transport.stop();
      Tone.Transport.cancel();
    } catch {
      // ignore
    }
    processedBaseToneSecRef.current = null;
    setIsProcessedPlaybackActive(false);
  }, []);

  const startProcessedPlayback = React.useCallback(
    async (fromMediaSec: number, rate: number) => {
      if (playbackSource !== "synth") return;
      const remaining = buildRemainingPracticeNotes(expectedNotesForProcessedPlayback, fromMediaSec, rate);
      if (remaining.length === 0) {
        setIsProcessedPlaybackActive(false);
        return;
      }

      await stopProcessedPlayback();

      const Tone = await import("tone");
      await Tone.start();
      toneRef.current = Tone;

      const synth = createInstrumentSynth(Tone, instrument);
      synthRef.current = synth;
      const base = Tone.now() + 0.05;
      processedBaseToneSecRef.current = base;

      for (const note of remaining) {
        synth.triggerAttackRelease(note.pitch, note.durationSec, base + note.offsetSec, 0.7);
      }

      const lastEnd = remaining.reduce((max, note) => Math.max(max, note.offsetSec + note.durationSec), 0);
      synthStopTimerRef.current = window.setTimeout(() => {
        try {
          synth.dispose();
        } catch {
          // ignore
        }
        if (synthRef.current === synth) synthRef.current = null;
        processedBaseToneSecRef.current = null;
        synthStopTimerRef.current = null;
        setIsProcessedPlaybackActive(false);
      }, Math.min(10 * 60_000, Math.ceil((lastEnd + 0.2) * 1000)));

      setIsProcessedPlaybackActive(true);
    },
    [expectedNotesForProcessedPlayback, playbackSource, stopProcessedPlayback, instrument]
  );

  const stopPractice = React.useCallback(async () => {
    setIsRunning(false);
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    await stopMicrophone();
    await stopProcessedPlayback();
  }, [stopMicrophone, stopProcessedPlayback]);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError("");
      try {
        if (assignmentId > 0) {
        const [user, assignments] = await Promise.all([authAPI.me(), assignmentAPI.list()]);
        if (cancelled) return;
          const resolvedInstrument = resolveStudentPracticeInstrument(
            requestedInstrument,
            (user as any)?.instrument ?? null
          );
          setInstrument(resolvedInstrument);
          const assignmentRows = Array.isArray(assignments) ? (assignments as any[]) : [];
          let found = assignmentRows.find((a: any) => Number(a?.id) === assignmentId) ?? null;
          if (found) setAssignment(found);

          if (String(found?.status ?? "assigned").toLowerCase() === "assigned") {
            try {
              const started = (await assignmentAPI.start(assignmentId)) as any;
              const startedId = Number(started?.assignment?.id ?? 0);
              if (startedId > 0 && startedId !== assignmentId) {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("assignmentId", String(startedId));
                navigate(`/student/practice/session?${nextParams.toString()}`, { replace: true });

                const updatedAssignments = await assignmentAPI.list();
                const updatedRows = Array.isArray(updatedAssignments) ? (updatedAssignments as any[]) : [];
                found = updatedRows.find((a: any) => Number(a?.id) === startedId) ?? found;
                setAssignment(found);
              }
            } catch {
              // ignore
            }
          }
          if (found?.musicSheet?.title) setTitle(String(found.musicSheet.title));
          if (found?.musicSheet?.artist) setArtist(String(found.musicSheet.artist));
          const musicSheetId = Number(found?.musicSheet?.id ?? 0);
          if (musicSheetId > 0) {
            const source = choosePreviewNoteSource(found?.musicSheet, resolvedInstrument);
            const music = await musicAPI.get(musicSheetId, { instrument: resolvedInstrument, source });
            if (cancelled) return;
            const notes = Array.isArray((music as any)?.notes) ? ((music as any).notes as PracticeExpectedNote[]) : [];
            const practiceTabData = extractPracticeTabData(music as any, resolvedInstrument);
            setExpectedNotes(notes);
            setTabEvents(practiceTabData.tabEvents);
            setTabMeasureStarts(practiceTabData.tabMeasureStarts);
            setNoteStatuses(notes.map(() => "pending"));
            setTimingGrades(notes.map(() => null));
            setHeldDurations(notes.map(() => 0));
          } else {
            const notes = Array.isArray(found?.musicSheet?.notes) ? found.musicSheet.notes : [];
            setExpectedNotes(notes ?? []);
            setTabEvents([]);
            setTabMeasureStarts([]);
            setNoteStatuses((notes ?? []).map(() => "pending"));
            setTimingGrades((notes ?? []).map(() => null));
            setHeldDurations((notes ?? []).map(() => 0));
          }
        } else {
          const user = await authAPI.me().catch(() => null);
          if (cancelled) return;
          setInstrument(resolveStudentPracticeInstrument(requestedInstrument, (user as any)?.instrument ?? null));
          setExpectedNotes([]);
          setTabEvents([]);
          setTabMeasureStarts([]);
          setNoteStatuses([]);
          setTimingGrades([]);
          setHeldDurations([]);
        }
      } catch (error: any) {
        if (!cancelled) setLoadError(error?.message ?? "Failed to load practice session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, requestedInstrument, navigate, searchParams]);

  React.useEffect(() => {
    return () => {
      void stopPractice();
    };
  }, [stopPractice]);

  React.useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const nowPerfMs = performance.now();
      const tone = toneRef.current;
      const baseTone = processedBaseToneSecRef.current;
      const rate = playbackRateRef.current;

      const nextElapsed =
        tone && typeof tone.now === "function" && baseTone != null
          ? Math.max(0, mediaElapsedBaseRef.current + Math.max(0, tone.now() - baseTone) * rate)
          : computePracticeMediaElapsed({
              isRunning: true,
              baseMediaSec: mediaElapsedBaseRef.current,
              basePerfMs: mediaPerfStartRef.current,
              nowPerfMs,
              playbackRate: rate,
            });
      setElapsedSec(nextElapsed);
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isRunning]);

  React.useEffect(() => {
    const nextRate = clampPracticePlaybackRate(playbackRate);
    const previousRate = playbackRateRef.current;

    if (!isRunningRef.current || previousRate === nextRate) {
      playbackRateRef.current = nextRate;
      return;
    }

    const nowPerfMs = performance.now();
    const tone = toneRef.current;
    const baseTone = processedBaseToneSecRef.current;
    const currentMedia =
      tone && typeof tone.now === "function" && baseTone != null
        ? Math.max(0, mediaElapsedBaseRef.current + Math.max(0, tone.now() - baseTone) * previousRate)
        : computePracticeMediaElapsed({
            isRunning: true,
            baseMediaSec: mediaElapsedBaseRef.current,
            basePerfMs: mediaPerfStartRef.current,
            nowPerfMs,
            playbackRate: previousRate,
          });

    mediaElapsedBaseRef.current = currentMedia;
    mediaPerfStartRef.current = nowPerfMs;
    playbackRateRef.current = nextRate;
    setElapsedSec(currentMedia);
    void startProcessedPlayback(currentMedia, nextRate);
  }, [playbackRate, startProcessedPlayback]);

  React.useEffect(() => {
    const nextStatuses = advanceMissedNotes(notesRef.current, statusesRef.current, elapsedSec, scoringConfig);
    if (nextStatuses.some((status, idx) => status !== statusesRef.current[idx])) {
      setNoteStatuses(nextStatuses);
    }
    const idx = getExpectedNoteIndex(notesRef.current, elapsedSec, scoringConfig);
    setCurrentExpectedIndex(idx);
    if (totalDuration > 0 && elapsedSec >= totalDuration + 0.3) {
      void stopPractice();
    }
  }, [elapsedSec, totalDuration, stopPractice, scoringConfig]);

  const startMicrophone = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      return;
    }

    if (micStreamRef.current && detectionIntervalRef.current != null && audioContextRef.current) {
      setMicStatus("ready");
      return;
    }

    setMicStatus("requesting");
    try {
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.();
      const stream = await navigator.mediaDevices.getUserMedia(buildPracticeAudioConstraints(supportedConstraints));
      micStreamRef.current = stream;
      setMicDeviceLabel(stream.getAudioTracks()[0]?.label ?? "Microphone");

       const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
       const audioContext = new AudioCtx();
       const analyser = audioContext.createAnalyser();
       // Higher FFT size improves low-frequency pitch detection (bass/brass) at the cost of a bit more CPU/latency.
       analyser.fftSize = 4096;
       analyser.smoothingTimeConstant = 0;
       const source = audioContext.createMediaStreamSource(stream);

       // Light filtering + compression makes pitch extraction more reliable across instruments and quiet inputs.
       const highpass = audioContext.createBiquadFilter();
       highpass.type = "highpass";
       highpass.frequency.value = 25;

       const lowpass = audioContext.createBiquadFilter();
       lowpass.type = "lowpass";
       lowpass.frequency.value = 5_000;

       const compressor = audioContext.createDynamicsCompressor();
       compressor.threshold.value = -40;
       compressor.knee.value = 30;
       compressor.ratio.value = 12;
       compressor.attack.value = 0;
       compressor.release.value = 0.25;

       source.connect(highpass);
       highpass.connect(lowpass);
       lowpass.connect(compressor);
       compressor.connect(analyser);

       audioContextRef.current = audioContext;
       analyserRef.current = analyser;
       setMicStatus("ready");

      const buffer = new Float32Array(analyser.fftSize);
      detectionIntervalRef.current = window.setInterval(() => {
        const analyserNode = analyserRef.current;
        if (!analyserNode) return;

        analyserNode.getFloatTimeDomainData(buffer);
        const frequency = detectPitchHzWithConfig(buffer, audioContext.sampleRate, pitchDetectionConfig);
        const midi = frequencyToMidi(frequency);
        const stablePitchState = stabiliseDetectedMidi(midiHistoryRef.current, midi);
        midiHistoryRef.current = stablePitchState.history;

        const stableFrequency =
          stablePitchState.stableMidi == null ? null : 440 * 2 ** ((stablePitchState.stableMidi - 69) / 12);
        const pitch = stablePitchState.stableMidi == null ? null : frequencyToPitch(stableFrequency);
        if (pitch) setMicSignalDetected(true);
        setPlayedFrequency(stableFrequency);
        setPlayedPitch(pitch);

        if (!isRunningRef.current) return;

        const evaluation = evaluateDetectedPracticeFrame({
          notes: notesRef.current,
          statuses: statusesRef.current,
          timingGrades: timingGradesRef.current,
          heldDurations: heldDurationsRef.current,
          currentTime: elapsedRef.current,
          playedPitch: pitch,
          frameDurationSec: 0.09,
          config: scoringConfig,
        });

        setCurrentExpectedIndex(evaluation.matchedIndex);
        setNoteStatuses(evaluation.statuses);
        setTimingGrades(evaluation.timingGrades);
        setHeldDurations(evaluation.heldDurations);

        if (debugPractice) {
          debugFrameRef.current += 1;
          if (debugFrameRef.current % 20 === 0) {
            const expected = evaluation.matchedIndex >= 0 ? notesRef.current[evaluation.matchedIndex]?.pitch : null;
            console.debug("[practice]", {
              t: Number(elapsedRef.current.toFixed(2)),
              expected,
              played: pitch,
              wrongHit: evaluation.wrongHit,
              matchedIndex: evaluation.matchedIndex,
              correct: evaluation.statuses.filter((s) => s === "correct").length,
            });
          }
        }
      }, 90);
    } catch {
      setMicStatus("denied");
    }
  }, []);

  const handleTogglePractice = async () => {
    if (!hasCompletedMicCheck) {
      await startMicrophone();
      setHasCompletedMicCheck(true);
      return;
    }

    if (isRunning) {
      await stopPractice();
      return;
    }

    setLastOutcome(null);
    setSheetPanSec(0);
    mediaElapsedBaseRef.current = Math.max(0, elapsedSec);
    mediaPerfStartRef.current = performance.now();
    playbackRateRef.current = clampPracticePlaybackRate(playbackRate);
    setIsRunning(true);
    await startMicrophone();
    await startProcessedPlayback(mediaElapsedBaseRef.current, playbackRateRef.current);
  };

  const handleSubmitSession = async () => {
    if (!assignmentId) {
      alert("Assignment ID is missing");
      return;
    }
    if (lastOutcome) return;

    const finalStatuses = advanceMissedNotes(
      expectedNotesTransposed,
      noteStatuses,
      Math.max(elapsedSec, totalDuration + 1),
      scoringConfig
    );
    const finalSummary = summarisePracticeStatuses(finalStatuses);
    const finalOutcome = buildPracticeOutcome({
      totalNotes: finalSummary.totalNotes,
      correctNotes: finalSummary.correctNotes,
      missedNotes: finalSummary.missedNotes,
      wrongNotes: finalSummary.incorrectNotes,
      timingGrades,
    });

    setIsSubmitting(true);
    try {
      const completedAtSec = Math.floor(Date.now() / 1000);
      const startedAtSec = Math.max(0, completedAtSec - Math.round(Math.max(0, elapsedSec)));
      await stopPractice();
      await sessionAPI.create(
        assignmentId,
        finalOutcome.accuracyScore,
        finalOutcome.timingScore,
        finalSummary.totalNotes,
        finalSummary.correctNotes,
        finalSummary.incorrectNotes,
        finalSummary.missedNotes,
        {
          duration: Math.max(elapsedSec, totalDuration),
          passed: finalOutcome.passed,
          startedAt: startedAtSec,
          completedAt: completedAtSec,
          performanceData: expectedNotesTransposed.map((note, index) => ({
            expectedPitch: note.pitch,
            startTime: note.startTime,
            duration: note.duration,
            status: finalStatuses[index],
            timingGrade: timingGrades[index],
            heldDuration: heldDurations[index] ?? 0,
          })),
        }
      );
      setLastOutcome(finalOutcome);
    } catch (error: any) {
      alert("Failed to save session: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const micLabel =
    micStatus === "ready"
      ? "Microphone Ready"
      : micStatus === "requesting"
        ? "Requesting Microphone"
        : micStatus === "denied"
          ? "Microphone Denied"
          : micStatus === "unsupported"
            ? "Microphone Unsupported"
            : "Microphone Idle";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ghostBtn" style={{ padding: "8px 12px" }} onClick={() => navigate(-1)}>
          {"<-"} Exit Practice
        </button>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="pill">
            Processed Audio: {playbackSource === "synth" ? (isProcessedPlaybackActive ? "Playing Synth" : "Synth Ready") : "Unavailable"}
          </span>
          <label
            className="pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 230,
              justifyContent: "space-between",
            }}
          >
            <span>Speed {formatPracticePlaybackRate(playbackRate)}</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={playbackRate}
              onChange={(event) => {
                setPlaybackRate(clampPracticePlaybackRate(Number(event.target.value)));
              }}
              style={{ width: 120 }}
              aria-label="Practice playback speed"
            />
          </label>
          <label
            className="pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 260,
              justifyContent: "space-between",
              opacity: isRunning || !!lastOutcome ? 0.6 : 1,
            }}
            title={isRunning ? "Stop practice to change transposition" : undefined}
          >
            <span>Transpose {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones} st</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={transposeSemitones}
              disabled={isRunning || !!lastOutcome}
              onChange={(event) => setTransposeSemitones(Number(event.target.value))}
              style={{ width: 120 }}
              aria-label="Practice transposition in semitones"
            />
          </label>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{title}</div>
        <div style={{ color: "rgba(241,194,75,.95)", fontSize: 30, fontWeight: 900 }}>{artist}</div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{micLabel}</span>
          <span className="pill">Music: {instrument}</span>
          <span className="pill" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Pitch:</span>
            <button
              type="button"
              className={"tabPill" + (pitchDisplay === "sounding" ? " tabPillActive" : "")}
              onClick={() => setPitchDisplay("sounding")}
              style={{ marginTop: 0 }}
            >
              Sounding
            </button>
            <button
              type="button"
              className={"tabPill" + (pitchDisplay === "written" ? " tabPillActive" : "")}
              onClick={() => setPitchDisplay("written")}
              style={{ marginTop: 0 }}
            >
              Written
            </button>
          </span>
          <span className="pill">{expectedNotes.length} expected notes</span>
          <span className="pill">Reference: {playbackSource === "synth" ? "Processed synth" : "No processed audio"}</span>
          {micDeviceLabel ? <span className="pill">{micDeviceLabel}</span> : null}
        </div>
      </div>

      {loading ? <div className="pageSubtitle">Loading practice session...</div> : null}
      {loadError ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
          {loadError}
        </div>
      ) : null}

      {!hasCompletedMicCheck ? (
        <div className="card" style={{ marginTop: 14, maxWidth: 760, marginInline: "auto" }}>
          <div className="sectionTitle">Microphone Check</div>
          <div className="sectionSub">Allow microphone access, play a few notes, then start the session.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="pill">{micSignalDetected ? "Signal detected" : "Waiting for signal"}</span>
            <span className="pill">{playedPitch ? `Detected ${playedPitchLabel}` : "No stable pitch yet"}</span>
            <button type="button" className="primaryBtn" style={{ marginTop: 0 }} onClick={handleTogglePractice}>
              Check Microphone
            </button>
          </div>
        </div>
      ) : null}

      {lastOutcome ? (
        <div className="card" style={{ marginTop: 14, maxWidth: 760, marginInline: "auto" }}>
          <div className="sectionTitle">Session Saved</div>
          <div className="sectionSub">
            {lastOutcome.passed
              ? "This assignment now counts as completed."
              : "This assignment remains in progress. Practice again to improve the score."}
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, textAlign: "center" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>
                {summary.correctNotes * 10}/{summary.totalNotes * 10}
              </div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                Score
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{lastOutcome.accuracyScore}%</div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>Accuracy</div>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{lastOutcome.timingScore}%</div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>Timing</div>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{lastOutcome.timingSummary.perfect}</div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>Perfect Hits</div>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{lastOutcome.assignmentStatus}</div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>Assignment</div>
            </div>
          </div>

          <div className="sectionTitle" style={{ marginTop: 14 }}>
            Guided Improvement
          </div>
          <div className="sectionSub">Suggestions based on this session’s timing and note hits.</div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {postSessionSuggestions.map((tip) => (
              <div
                key={tip}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "rgba(255,255,255,.02)",
                  fontSize: 12,
                }}
              >
                {tip}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="primaryBtn" style={{ marginTop: 0 }} onClick={() => navigate("/student/analytics")}>
              View Analytics
            </button>
            <button type="button" className="ghostBtn" style={{ marginTop: 0 }} onClick={() => navigate("/student/practice")}>
              Back to Practice List
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          maxWidth: 720,
          marginInline: "auto",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 40 }}>{score}</div>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>SCORE</div>
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 40 }}>{progress}%</div>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>PROGRESS</div>
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 40, color: "rgba(241,194,75,.95)" }}>{currentExpectedLabel}</div>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>EXPECTED</div>
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 40 }}>{playedPitchLabel}</div>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>YOU PLAY</div>
        </div>
      </div>

      <div
        className="sheetPreviewBox"
        style={{
          marginTop: 16,
          height: practiceSheetLayout.viewHeight,
          borderWidth: 2,
          cursor: !isRunning && !lastOutcome ? (isSheetDragging ? "grabbing" : "grab") : undefined,
          touchAction: !isRunning && !lastOutcome ? "none" : undefined,
        }}
        onPointerDown={(event) => {
          if (isRunning || lastOutcome) return;
          if (event.button != null && event.button !== 0) return;
          (event.currentTarget as any)?.setPointerCapture?.(event.pointerId);
          sheetDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startPan: sheetPanSec };
          setIsSheetDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = sheetDragRef.current;
          if (!drag) return;
          if (drag.pointerId !== event.pointerId) return;
          if (isRunning || lastOutcome) return;
          const dx = event.clientX - drag.startX;
          const pxPerSecond = 130;
          const nextPan = drag.startPan + -dx / pxPerSecond;
          setSheetPanSec(Math.max(0, Math.min(totalDuration, nextPan)));
        }}
        onPointerUp={(event) => {
          const drag = sheetDragRef.current;
          if (!drag) return;
          if (drag.pointerId !== event.pointerId) return;
          sheetDragRef.current = null;
          setIsSheetDragging(false);
        }}
        onPointerCancel={(event) => {
          const drag = sheetDragRef.current;
          if (!drag) return;
          if (drag.pointerId !== event.pointerId) return;
          sheetDragRef.current = null;
          setIsSheetDragging(false);
        }}
      >
        <svg viewBox={`0 0 1000 ${practiceSheetLayout.viewHeight}`} width="100%" height="100%">
          <rect x="0" y="0" width="1000" height={practiceSheetLayout.viewHeight} fill="rgba(255,255,255,0.01)" />
          {practiceSheetLayout.staffLineYs.map((y) => (
            <line key={`staff1-${y}`} x1="30" y1={y} x2="970" y2={y} stroke="rgba(216,221,231,.25)" strokeWidth="1" />
          ))}
          {[170, 320, 470, 620, 770, 920].map((x) => (
            <line
              key={`bar-${x}`}
              x1={x}
              y1={practiceSheetLayout.barlineY1}
              x2={x}
              y2={practiceSheetLayout.barlineY2}
              stroke="rgba(216,221,231,.18)"
              strokeWidth="1"
            />
          ))}
          <text
            x={practiceSheetLayout.clefX}
            y={practiceSheetLayout.clefY}
            fill="rgba(216,221,231,.85)"
            fontSize="30"
            fontFamily="serif"
          >
            {previewClefSymbol(previewClef)}
          </text>
          <line
            x1={practiceSheetLayout.playheadX}
            y1={practiceSheetLayout.playheadY1}
            x2={practiceSheetLayout.playheadX}
            y2={practiceSheetLayout.playheadY2}
            stroke="rgba(241,194,75,.8)"
            strokeWidth="2"
          />
          {laneGlyphs.map((g, idx) => (
            <g key={`${g.startTime}-${g.midi}-${idx}`}>
	              {(() => {
	                const status = noteStatuses[g.noteIndex] ?? "pending";
	                const color = statusFill(status);
	                const ledgerStroke = statusStroke(status);

                 return (
                   <>
                    {g.ledgerLineYs.map((ledgerY, ledgerIdx) => (
                <line
                  key={`ledger-${g.startTime}-${idx}-${ledgerIdx}`}
                  x1={g.x - 16}
                  y1={ledgerY}
                  x2={g.x + 16}
                  y2={ledgerY}
                  stroke={ledgerStroke}
                  strokeWidth="1.5"
                />
                    ))}
              <ellipse
                cx={g.x}
                cy={g.y}
                rx={g.isActive ? 12 : 10}
                ry={g.isActive ? 9 : 7}
                fill={color}
                transform={`rotate(-20 ${g.x} ${g.y})`}
              />
              {instrument.toLowerCase() !== "guitar" ? (
                (() => {
                  const label = formatPracticeMusicalLabel(g.displayPitch, instrument);
                  if (!label) return null;
                  return (
                    <text
                      x={g.x}
                      y={g.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      alignmentBaseline="middle"
                      fill="rgba(16,18,24,.92)"
                      fontSize="10"
                      fontWeight={800}
                      fontFamily="ui-sans-serif, system-ui"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {label}
                    </text>
                  );
                })()
              ) : null}
                  </>
                );
              })()}
            </g>
          ))}
          {previewHasTabLane ? (
            <g>
              <text
                x={practiceSheetLayout.tabLabelX}
                y={practiceSheetLayout.tabLabelY}
                fill="rgba(216,221,231,.55)"
                fontSize="20"
                fontFamily="ui-sans-serif, system-ui"
              >
                TAB
              </text>
              {practiceSheetLayout.tabLineYs.map((y) => (
                <line key={`tab-${y}`} x1="70" y1={y} x2="970" y2={y} stroke="rgba(216,221,231,.18)" strokeWidth="1" />
              ))}
              {practiceTabGlyphs.barlines.map((x, index) => (
                <line
                  key={`tab-bar-${x}-${index}`}
                  x1={x}
                  y1={practiceSheetLayout.tabBarlineY1}
                  x2={x}
                  y2={practiceSheetLayout.tabBarlineY2}
                  stroke="rgba(216,221,231,.12)"
                  strokeWidth="1"
                />
              ))}
              {practiceTabGlyphs.glyphs.map((glyph) => (
                (() => {
                  const status = tabStatusByKey.get(glyph.key) ?? "pending";
                  const fill = statusFill(status);
                  return (
                 <text
                   key={glyph.key}
                   x={glyph.x}
                   y={glyph.textY}
                   textAnchor="middle"
                   dominantBaseline="middle"
                  fill={fill}
                  fontSize="15"
                  fontWeight={700}
                  fontFamily="'Arial Narrow', 'Helvetica Neue', ui-sans-serif, system-ui"
                 >
                   {glyph.fret}
                 </text>
                  );
                })()
              ))}
            </g>
          ) : null}
        </svg>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>{accuracyScore}%</div>
            <div className="pageSubtitle" style={{ marginTop: 0 }}>Accuracy</div>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>{timingScore}%</div>
            <div className="pageSubtitle" style={{ marginTop: 0 }}>Timing</div>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>{summary.correctNotes}</div>
            <div className="pageSubtitle" style={{ marginTop: 0 }}>Correct</div>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28, color: "rgba(255,120,120,.95)" }}>{wrongNotes}</div>
            <div className="pageSubtitle" style={{ marginTop: 0 }}>Wrong</div>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28, color: "rgba(241,194,75,.95)" }}>{summary.missedNotes}</div>
            <div className="pageSubtitle" style={{ marginTop: 0 }}>Missed</div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <span className="pill" style={{ color: realtimeFeedback.pitchLabel.color }}>
            {realtimeFeedback.pitchLabel.label}
          </span>
          <span className="pill" style={{ color: realtimeFeedback.timingLabel.color }}>
            {realtimeFeedback.timingLabel.label}
          </span>
          <span className="pill" style={{ color: realtimeFeedback.noteLabel.color }}>
            {realtimeFeedback.noteLabel.label}
          </span>
        </div>

        <div
          style={{
            marginTop: 10,
            height: 6,
            borderRadius: 999,
            background: `linear-gradient(90deg, rgba(241,194,75,.28) 0%, rgba(241,194,75,.28) ${progress}%, rgba(241,194,75,.08) ${progress}%, rgba(241,194,75,.08) 100%)`,
            border: "1px solid rgba(241,194,75,.22)",
          }}
        />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>
            Elapsed: {elapsedSec.toFixed(1)}s {playedFrequency ? `| ${playedFrequency.toFixed(1)}Hz` : ""}
          </div>
          <div className="pageSubtitle" style={{ marginTop: 0 }}>
            Perfect {timingSummary.perfect} | Early {timingSummary.early} | Late {timingSummary.late}
          </div>
          <button
            type="button"
            className="primaryBtn"
            style={{ minWidth: 120, marginTop: 0 }}
            onClick={handleTogglePractice}
            disabled={loading || !!lastOutcome || playbackSource === "none"}
          >
            {!hasCompletedMicCheck ? "Check Mic" : isRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            className="primaryBtn"
            onClick={handleSubmitSession}
            disabled={isSubmitting || !!lastOutcome || !hasCompletedMicCheck}
            style={{ marginTop: 0 }}
          >
            {isSubmitting ? "Submitting..." : "Finish & Save"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <button type="button" className="ghostBtn" onClick={() => navigate(-1)}>
          {"<-"} Back to Practice
        </button>
      </div>
    </div>
  );
}
