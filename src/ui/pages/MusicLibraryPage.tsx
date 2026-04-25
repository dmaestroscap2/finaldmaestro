import React from "react";
import { PageHeader } from "../shared/PageHeader";
import { INSTRUMENTS, type Instrument } from "../data/instruments";
import { API_BASE, assignmentAPI, classroomAPI, musicAPI, studentsAPI } from "../../api/client";
import { buildClassroomAssignmentOptions } from "./assignmentDropdowns.utils";
import { choosePreviewNoteSource, formatDuration, getNoteCount } from "./musicLibrary.utils";
import {
  computeNoteLaneGlyphs,
  computeTabLaneGlyphs,
  previewClefForInstrument,
  previewClefSymbol,
  resolveAudioUrl,
  transposePitch,
  type PitchDisplay,
} from "./musicPreview.utils";
import { filterMusicXmlByPartName, parseMusicXml } from "./musicXml.utils";
import { createInstrumentSynth } from "./instrumentSynth.utils";
import { formatPracticeMusicalLabel } from "./student/studentPracticeLabel.utils";
import { useAutoRefresh } from "../shared/useAutoRefresh";

export function MusicLibraryPage() {
  const staffLineYs = [82, 98, 114, 130, 146];
  const previewSvgHeight = 340;
  const tabYTop = 224;
  const tabSpacing = 10;
  const [musicSheets, setMusicSheets] = React.useState<any[]>([]);
  const [musicLoading, setMusicLoading] = React.useState(true);
  const [musicError, setMusicError] = React.useState("");
  const refreshMusicRequestIdRef = React.useRef(0);
  React.useEffect(() => {
    return () => {
      refreshMusicRequestIdRef.current += 1;
    };
  }, []);
  const [selectedMusic, setSelectedMusic] = React.useState<any | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [isTransposeOpen, setIsTransposeOpen] = React.useState(false);
  const [assignMode, setAssignMode] = React.useState<"class" | "student">("class");
  const [assignTarget, setAssignTarget] = React.useState("");
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [assignOptionsLoading, setAssignOptionsLoading] = React.useState(false);
  const [classroomOptions, setClassroomOptions] = React.useState<Array<{ value: string; label: string }>>([]);
  const [studentOptions, setStudentOptions] = React.useState<Array<{ value: string; label: string }>>([]);
  const [previewTab, setPreviewTab] = React.useState<
    "original" | "synth" | "instrument" | "notation"
  >("original");
  const [instrument, setInstrument] = React.useState<Instrument>("piano");
  const [noteSource, setNoteSource] = React.useState<"klang_json" | "midi_quant" | "stored">("midi_quant");
  const [pitchDisplay, setPitchDisplay] = React.useState<PitchDisplay>("sounding");
  const [transposeInstrument, setTransposeInstrument] =
    React.useState<Instrument>("piano");
  const [semitones, setSemitones] = React.useState(0);
  const [uploadTitle, setUploadTitle] = React.useState("");
  const [uploadComposer, setUploadComposer] = React.useState("");
  const [uploadFileName, setUploadFileName] = React.useState<string | null>(null);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isOriginalPlaying, setIsOriginalPlaying] = React.useState(false);
  const [isSynthPlaying, setIsSynthPlaying] = React.useState(false);
  const synthRef = React.useRef<any | null>(null);
  const synthStopTimerRef = React.useRef<number | null>(null);
  const toneRef = React.useRef<any | null>(null);
  const synthBaseToneSecRef = React.useRef<number | null>(null);
  const synthStartOffsetSecRef = React.useRef<number>(0);
  const [previewTimeSec, setPreviewTimeSec] = React.useState(0);
  const [noteOffsetSec, setNoteOffsetSec] = React.useState(0);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const isScrubbingRef = React.useRef(false);
  const scrubStartXSvgRef = React.useRef(0);
  const scrubStartTimeRef = React.useRef(0);
  const [musicXmlError, setMusicXmlError] = React.useState("");
  const [musicXmlWarning, setMusicXmlWarning] = React.useState("");
  const [musicXmlRendering, setMusicXmlRendering] = React.useState(false);
  const [notationZoom, setNotationZoom] = React.useState(1.0);
  const musicXmlRef = React.useRef<HTMLDivElement | null>(null);
  const musicXmlOsmdRef = React.useRef<any | null>(null);
  const musicXmlDocRef = React.useRef<{ full: Document; filtered: Document; usedFiltered: boolean } | null>(null);

  const audioUrl = resolveAudioUrl(API_BASE, selectedMusic?.audioPath);

  const stopAllPreviewAudio = React.useCallback(async () => {
    // Stop HTML audio.
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setIsOriginalPlaying(false);

    // Stop Tone.js synth if running.
    try {
      const Tone = await import("tone");
      Tone.Transport.stop();
      Tone.Transport.cancel();
    } catch {
      // ignore
    }

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
    toneRef.current = null;
    synthBaseToneSecRef.current = null;
    synthStartOffsetSecRef.current = 0;
    setPreviewTimeSec(0);
    setIsSynthPlaying(false);
  }, []);

  const refreshMusic = React.useCallback(async () => {
    const requestId = ++refreshMusicRequestIdRef.current;
    setMusicError("");
    setMusicLoading(true);
    try {
      const data = await musicAPI.list();
      if (requestId !== refreshMusicRequestIdRef.current) return;
      setMusicSheets(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (requestId !== refreshMusicRequestIdRef.current) return;
      setMusicError(err?.message ?? "Failed to load music library");
      setMusicSheets([]);
    } finally {
      if (requestId === refreshMusicRequestIdRef.current) setMusicLoading(false);
    }
  }, []);

  const handleDeleteMusic = React.useCallback(
    async (music: any) => {
      const id = Number(music?.id ?? 0);
      if (!Number.isFinite(id) || id <= 0) return;
      const title = String(music?.title ?? "this piece");
      const ok = window.confirm(`Delete "${title}"? This will remove it from the library.`);
      if (!ok) return;

      await stopAllPreviewAudio();
      try {
        await musicAPI.remove(id);
        if (selectedMusic?.id === id) {
          setSelectedMusic(null);
          setIsPreviewOpen(false);
        }
        await refreshMusic();
      } catch (error: any) {
        alert("Failed to delete music: " + (error?.message ?? "Unknown error"));
      }
    },
    [refreshMusic, selectedMusic?.id, stopAllPreviewAudio]
  );

  useAutoRefresh(refreshMusic, { intervalMs: 30_000 });

  const refreshAssignOptions = React.useCallback(async () => {
    setAssignOptionsLoading(true);
    try {
      const [classrooms, students] = await Promise.all([classroomAPI.list(), studentsAPI.list()]);
      setClassroomOptions(buildClassroomAssignmentOptions(Array.isArray(classrooms) ? classrooms : []));
      setStudentOptions(
        (Array.isArray(students) ? students : []).map((student: any) => ({
          value: String(student.id),
          label: String(student.name ?? student.email ?? `Student ${student.id}`),
        }))
      );
    } catch (error) {
      console.error("Failed to load assignment targets:", error);
      setClassroomOptions([]);
      setStudentOptions([]);
    } finally {
      setAssignOptionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAssignOpen) return;
    void refreshAssignOptions();
  }, [isAssignOpen, refreshAssignOptions]);

  React.useEffect(() => {
    // Keep preview audio state correct when switching songs/modals.
    void stopAllPreviewAudio();
  }, [selectedMusic, isPreviewOpen, stopAllPreviewAudio]);

  React.useEffect(() => {
    // Prefer quantized MIDI when available because it tends to align better for playback+scrolling.
    // Fall back to Klang JSON (part-aware) or stored notes for older rows.
    if (!isPreviewOpen) return;
    const m = selectedMusic;
    if (!m) return;
    const next = choosePreviewNoteSource(m, instrument);

    setNoteSource((prev) => (prev === next ? prev : next));
  }, [isPreviewOpen, selectedMusic?.id, instrument]);

  // When previewing, pull instrument-specific notes from the server if this piece has multi-part data.
  React.useEffect(() => {
    if (!isPreviewOpen) return;
    const id = selectedMusic?.id;
    if (!id) return;

    let cancelled = false;
    void (async () => {
      try {
        const fresh = await musicAPI.get(Number(id), { instrument, source: noteSource });
        if (cancelled) return;
        // Only overwrite fields we care about for preview (notes + optional metadata).
        setSelectedMusic((prev: any) =>
          prev && prev.id === id
            ? (() => {
                const merged = { ...(prev as any), ...(fresh as any) };
                // Avoid mixing tabEvents from Klang JSON with notes from MIDI/stored sources.
                const inst = String(instrument ?? "").trim().toLowerCase();
                // Also avoid "stale" TAB values when switching away from guitar:
                // JSON responses omit undefined fields, so a previous guitar fetch can linger in state.
                if (noteSource !== "klang_json" || inst !== "guitar") {
                  delete (merged as any).tabEvents;
                  delete (merged as any).tabMeasureStarts;
                }
                return merged;
              })()
            : prev
        );
      } catch {
        // ignore: fallback to existing notesJson-based notes
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPreviewOpen, selectedMusic?.id, instrument, noteSource]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle || !uploadComposer) {
      setUploadError("Please fill in all fields");
      return;
    }

    setUploadError("");
    setUploadLoading(true);

    try {
      await musicAPI.uploadAndTranscribe(uploadFile, uploadTitle, uploadComposer);
      await refreshMusic();

      // Reset form
      setUploadTitle("");
      setUploadComposer("");
      setUploadFileName(null);
      setUploadFile(null);
      setIsUploadOpen(false);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleAssignPiece = async () => {
    if (!selectedMusic?.id || !assignTarget) return;

    setAssignLoading(true);
    try {
      if (assignMode === "class") {
        await assignmentAPI.create(Number(selectedMusic.id), null, Number(assignTarget));
      } else {
        await assignmentAPI.create(Number(selectedMusic.id), Number(assignTarget), null);
      }
      setIsAssignOpen(false);
      setAssignTarget("");
    } catch (error: any) {
      alert("Failed to assign piece: " + error.message);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleToggleOriginal = async () => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;

    if (a.paused) {
      await stopAllPreviewAudio();
      try {
        const desired = Number.isFinite(previewTimeSec) ? Math.max(0, previewTimeSec) : 0;
        if (Number.isFinite(a.duration) && a.duration > 0) {
          a.currentTime = Math.min(a.duration, desired);
        } else {
          a.currentTime = desired;
        }
        await a.play();
        setIsOriginalPlaying(true);
      } catch (e) {
        setUploadError((e as any)?.message ?? "Audio playback failed");
      }
    } else {
      a.pause();
      setIsOriginalPlaying(false);
      setPreviewTimeSec(a.currentTime || 0);
    }
  };

  React.useEffect(() => {
    if (!isPreviewOpen || previewTab !== "notation" || !musicXmlRef.current) return;
    const id = selectedMusic?.id;
    if (!id) return;

    let cancelled = false;
    const container = musicXmlRef.current;

    void (async () => {
      setMusicXmlRendering(true);
      setMusicXmlError("");
      setMusicXmlWarning("");
      try {
        const meta = await musicAPI.get(Number(id), { instrument, source: "klang_json" });
        if (cancelled) return;

        const xmlUrl = resolveAudioUrl(API_BASE, (meta as any)?.klangioMxmlPath);
        if (!xmlUrl) throw new Error("No MusicXML is available for this piece.");

        const xmlResp = await fetch(xmlUrl, { credentials: "include" });
        if (!xmlResp.ok) throw new Error(`MusicXML fetch failed: HTTP ${xmlResp.status}`);
        const xmlText = await xmlResp.text();
        if (cancelled) return;

        const xmlDocument = parseMusicXml(xmlText);
        const filtered = filterMusicXmlByPartName(xmlDocument, (meta as any)?.partName);

        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;

        const ensureOsmd = () => {
          if (musicXmlOsmdRef.current) return musicXmlOsmdRef.current;
          container.innerHTML = "";
          const osmd = new OpenSheetMusicDisplay(container, {
            autoResize: true,
            backend: "svg",
            // "compacttight" looks cramped; "default" is closer to typical notation spacing.
            drawingParameters: "default",
            drawTitle: true,
            drawComposer: true,
            drawPartNames: true,
            newSystemFromXML: true,
            pageFormat: "Endless",
          });
          musicXmlOsmdRef.current = osmd;
          return osmd;
        };

        const setOsmdZoom = (osmd: any, zoom: number) => {
          const z = Number.isFinite(zoom) ? Math.max(0.5, Math.min(2.0, zoom)) : 1.0;
          try {
            if ("Zoom" in osmd) osmd.Zoom = z;
            if ("zoom" in osmd) osmd.zoom = z;
          } catch {
            // ignore zoom setter errors
          }
        };

        const renderDocument = async (doc: Document, mode: string) => {
          const osmd = ensureOsmd();
          setOsmdZoom(osmd, notationZoom);
          await osmd.load(doc);
          if (cancelled) return;
          osmd.render();
          setMusicXmlWarning(mode);
        };

        try {
          await renderDocument(
            filtered.xmlDocument,
            filtered.usedFilteredDocument ? "Showing filtered part (matched instrument)." : ""
          );
          musicXmlDocRef.current = { full: xmlDocument, filtered: filtered.xmlDocument, usedFiltered: filtered.usedFilteredDocument };
        } catch (filteredError: any) {
          if (!filtered.usedFilteredDocument) throw filteredError;
          await renderDocument(xmlDocument, "");
          if (cancelled) return;
          setMusicXmlWarning(
            `Part-filtered render failed, showing full score instead. (${filteredError?.message ?? "unknown render error"})`
          );
          musicXmlDocRef.current = { full: xmlDocument, filtered: xmlDocument, usedFiltered: false };
        }
      } catch (e: any) {
        if (!cancelled) {
          container.innerHTML = "";
          musicXmlOsmdRef.current = null;
          musicXmlDocRef.current = null;
          setMusicXmlError(e?.message ?? "Failed to render MusicXML");
        }
      } finally {
        if (!cancelled) setMusicXmlRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      container.innerHTML = "";
      musicXmlOsmdRef.current = null;
      musicXmlDocRef.current = null;
    };
  }, [isPreviewOpen, previewTab, selectedMusic?.id, instrument, notationZoom]);

  React.useEffect(() => {
    if (!isPreviewOpen || previewTab !== "notation") return;
    const osmd = musicXmlOsmdRef.current;
    if (!osmd) return;
    const z = Number.isFinite(notationZoom) ? Math.max(0.5, Math.min(2.0, notationZoom)) : 1.0;
    try {
      if ("Zoom" in osmd) osmd.Zoom = z;
      if ("zoom" in osmd) osmd.zoom = z;
      osmd.render();
    } catch {
      // ignore zoom re-render errors
    }
  }, [isPreviewOpen, previewTab, notationZoom]);

  const handleToggleSynth = async () => {
    const notes: Array<{ pitch?: string; startTime?: number; duration?: number; frequency?: number }> =
      Array.isArray(previewNotesTransposed) ? (previewNotesTransposed as any) : [];

    if (notes.length === 0) return;

    if (isSynthPlaying) {
      await stopAllPreviewAudio();
      return;
    }

    await stopAllPreviewAudio();
    setIsSynthPlaying(true);

    const Tone = await import("tone");
    await Tone.start();
    toneRef.current = Tone;

    const synth = createInstrumentSynth(Tone, instrument);
    synthRef.current = synth;
    const startAtSec = Number.isFinite(previewTimeSec) ? Math.max(0, previewTimeSec) : 0;
    const base = Tone.now() + 0.05;
    // Align lane clock with Tone's scheduler timebase (more accurate than performance.now()).
    synthBaseToneSecRef.current = base;
    synthStartOffsetSecRef.current = startAtSec;

    for (const n of notes) {
      const st = typeof n.startTime === "number" ? n.startTime : 0;
      const dur = typeof n.duration === "number" ? n.duration : 0.1;
      const end = st + dur;
      if (end <= startAtSec) continue;
      const pitch = typeof n.pitch === "string" ? n.pitch : null;
      if (!pitch) continue;

      const offsetSec = Math.max(0, st - startAtSec);
      const remainingDur = end - Math.max(st, startAtSec);
      synth.triggerAttackRelease(pitch, Math.max(0.05, remainingDur), base + offsetSec, 0.7);
    }

    // Auto-stop after the last note ends (best-effort).
    const maxEnd = notes.reduce((acc, n) => {
      const st = typeof n.startTime === "number" ? n.startTime : 0;
      const dur = typeof n.duration === "number" ? n.duration : 0;
      return Math.max(acc, st + dur);
    }, 0);
    synthStopTimerRef.current = window.setTimeout(() => {
      try {
        synth.dispose();
      } catch {
        // ignore
      }
      if (synthRef.current === synth) synthRef.current = null;
      synthBaseToneSecRef.current = null;
      synthStartOffsetSecRef.current = 0;
      synthStopTimerRef.current = null;
      setIsSynthPlaying(false);
    }, Math.min(10 * 60_000, Math.ceil((Math.max(0, maxEnd - startAtSec) + 0.5) * 1000)));
  };

  const handlePlayTransposePreview = async () => {
    const notes: Array<{ pitch?: string; startTime?: number; duration?: number }> =
      Array.isArray(previewNotesTransposed) ? (previewNotesTransposed as any) : [];
    if (notes.length === 0) return;

    await stopAllPreviewAudio();

    const Tone = await import("tone");
    await Tone.start();

    const synth = createInstrumentSynth(Tone, transposeInstrument);
    synthRef.current = synth;

    const base = Tone.now() + 0.05;
    for (const n of notes) {
      const st = typeof n.startTime === "number" && Number.isFinite(n.startTime) ? n.startTime : 0;
      const dur = typeof n.duration === "number" && Number.isFinite(n.duration) ? n.duration : 0.1;
      const pitch = typeof n.pitch === "string" ? n.pitch : null;
      if (!pitch) continue;
      synth.triggerAttackRelease(pitch, Math.max(0.05, dur), base + Math.max(0, st), 0.7);
    }

    const maxEnd = notes.reduce((acc, n) => {
      const st = typeof n.startTime === "number" ? n.startTime : 0;
      const dur = typeof n.duration === "number" ? n.duration : 0;
      return Math.max(acc, st + dur);
    }, 0);

    synthStopTimerRef.current = window.setTimeout(() => {
      try {
        synth.dispose();
      } catch {
        // ignore
      }
      if (synthRef.current === synth) synthRef.current = null;
      synthStopTimerRef.current = null;
    }, Math.min(10 * 60_000, Math.ceil((maxEnd + 0.5) * 1000)));
  };

  React.useEffect(() => {
    if (!isPreviewOpen) return;
    if (!isOriginalPlaying && !isSynthPlaying) return;

    let raf = 0;
    let last = 0;

    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const now = performance.now();
      // ~30fps cap for a cheap but smooth-enough lane.
      if (now - last < 33) return;
      last = now;

      const a = audioRef.current;
      const audioTime = a ? a.currentTime : 0;
      const tone = toneRef.current;
      const baseTone = synthBaseToneSecRef.current;
      const synthOffset = synthStartOffsetSecRef.current;
      const synthTime =
        tone && typeof tone.now === "function" && baseTone != null ? Math.max(0, synthOffset + (tone.now() - baseTone)) : 0;

      let t = 0;
      if (previewTab === "original" && isOriginalPlaying) t = audioTime;
      else if (previewTab === "synth" && isSynthPlaying) t = synthTime;
      else t = isOriginalPlaying ? audioTime : synthTime;

      setPreviewTimeSec(t);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isPreviewOpen, isOriginalPlaying, isSynthPlaying, previewTab]);

  const handleDownloadNotes = () => {
    const notes = selectedMusic?.notes ?? null;
    const json = JSON.stringify(notes ?? [], null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = String(selectedMusic?.title ?? "notes").replace(/[^\w\- ]+/g, "").trim() || "notes";
    a.download = `${safeTitle}.notes.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFromUrl = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noreferrer";
    a.click();
  };

  const previewNotes = React.useMemo(() => {
    const raw = selectedMusic?.notes ?? null;
    return Array.isArray(raw) ? raw : [];
  }, [selectedMusic]);

  const previewNotesTransposed = React.useMemo(() => {
    const shift = Number.isFinite(semitones) ? Math.max(-24, Math.min(24, Math.trunc(semitones))) : 0;
    if (shift === 0) return previewNotes;
    return previewNotes.map((n: any) => {
      const pitch = typeof n?.pitch === "string" ? n.pitch : null;
      if (!pitch) return n;
      const next = transposePitch(pitch, shift);
      if (!next) return n;
      return { ...n, pitch: next };
    });
  }, [previewNotes, semitones]);

  const previewDurationSec = React.useMemo(() => {
    return previewNotes.reduce((max, note) => {
      const st = typeof note?.startTime === "number" && Number.isFinite(note.startTime) ? note.startTime : 0;
      const dur = typeof note?.duration === "number" && Number.isFinite(note.duration) ? note.duration : 0;
      return Math.max(max, st + dur);
    }, 0);
  }, [previewNotes]);

  const handlePreviewScrubPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isOriginalPlaying || isSynthPlaying) return;
    if (previewTab === "notation") return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;

    const xSvg = ((e.clientX - rect.left) / rect.width) * 1000;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    scrubStartXSvgRef.current = xSvg;
    scrubStartTimeRef.current = previewTimeSec;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePreviewScrubPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isScrubbingRef.current) return;
    if (isOriginalPlaying || isSynthPlaying) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const xSvg = ((e.clientX - rect.left) / rect.width) * 1000;

    const pxPerSecond = 120;
    const dx = xSvg - scrubStartXSvgRef.current;
    const next = scrubStartTimeRef.current - dx / pxPerSecond;
    setPreviewTimeSec(Math.max(0, Math.min(previewDurationSec, next)));
  };

  const handlePreviewScrubPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const laneGlyphs = React.useMemo(() => {
    return computeNoteLaneGlyphs({
      notes: previewNotesTransposed,
      // Positive offset moves notes earlier (lane "ahead" of audio).
      currentTime: previewTimeSec + noteOffsetSec,
      instrument,
      pitchDisplay,
      viewWidth: 1000,
      playheadX: 220,
      pxPerSecond: 120,
      staffLineYs,
      xMargin: 80,
    });
  }, [previewNotesTransposed, previewTimeSec, noteOffsetSec, instrument, pitchDisplay]);

  const previewClef = React.useMemo(() => previewClefForInstrument(instrument), [instrument]);

  const laneNoteFill =
    previewTab === "original"
      ? "rgba(216,221,231,.9)"
      : previewTab === "synth"
        ? "rgba(126,168,255,.95)"
        : "rgba(241,194,75,.95)";

  const tabGlyphs = React.useMemo(() => {
    if (noteSource !== "klang_json") return { glyphs: [], barlines: [] };
    if (String(instrument ?? "").trim().toLowerCase() !== "guitar") return { glyphs: [], barlines: [] };
    const raw = (selectedMusic as any)?.tabEvents ?? null;
    const tabEvents: Array<{ startTime?: number; duration?: number; string?: number; fret?: number }> = Array.isArray(raw)
      ? raw
      : [];

    const shift = Number.isFinite(semitones) ? Math.max(-24, Math.min(24, Math.trunc(semitones))) : 0;
    const shiftedTabEvents =
      shift === 0
        ? tabEvents
        : tabEvents.map((ev) => {
            const fret = typeof ev?.fret === "number" && Number.isFinite(ev.fret) ? ev.fret : null;
            if (fret == null) return ev;
            const nextFret = Math.max(0, Math.min(24, Math.round(fret + shift)));
            return { ...ev, fret: nextFret };
          });
    const measureStartsRaw = (selectedMusic as any)?.tabMeasureStarts ?? null;
    const measureStarts: number[] = Array.isArray(measureStartsRaw)
      ? measureStartsRaw.filter((x: any) => typeof x === "number" && Number.isFinite(x))
      : [];

    const viewWidth = 1000;
    const playheadX = 220;
    const pxPerSecond = 120;
    const xMargin = 80;

    return computeTabLaneGlyphs({
      tabEvents: shiftedTabEvents,
      measureStarts,
      currentTime: previewTimeSec + noteOffsetSec,
      viewWidth,
      playheadX,
      pxPerSecond,
      xMargin,
      yTop: tabYTop,
      spacing: tabSpacing,
    });
  }, [selectedMusic, previewTimeSec, noteOffsetSec, instrument, noteSource, semitones]);

  return (
    <div>
      <PageHeader
        title="Music Library"
        subtitle="Manage your sheet music and assign pieces to students."
        right={
          <button
            className="primaryBtn"
            type="button"
            style={{ width: 140 }}
            onClick={() => setIsUploadOpen(true)}
          >
            Upload MP3
          </button>
        }
      />

      {musicLoading ? (
        <div className="pageSubtitle">Loading music library...</div>
      ) : musicError ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.9)" }}>
          {musicError}
        </div>
      ) : musicSheets.length === 0 ? (
        <div className="pageSubtitle">No music yet. Click “Upload MP3” to add one.</div>
      ) : (
	        <div className="gridCards3">{musicSheets.map((m) => {
          const durationLabel = formatDuration(m?.duration);
          const difficultyLabel = String(m?.difficulty ?? "medium");
          const noteCount = getNoteCount(m);

          return (
	            <div key={m?.id ?? `${m?.title}-${m?.audioPath}`} className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(241,194,75,.10)",
                    border: "1px solid rgba(241,194,75,.22)",
                    color: "rgba(241,194,75,.92)",
                    fontWeight: 900,
                  }}
                >
                  ♪
                </div>
	                <div style={{ flex: 1, minWidth: 0 }}>
	                  <div
	                    style={{
	                      fontWeight: 900,
	                      overflow: "hidden",
	                      display: "-webkit-box",
	                      WebkitLineClamp: 2,
	                      WebkitBoxOrient: "vertical",
	                      lineHeight: 1.2,
	                    }}
	                  >
	                    {m?.title ?? "Untitled"}
	                  </div>
	                  <div
	                    className="pageSubtitle"
	                    style={{
	                      overflow: "hidden",
	                      display: "-webkit-box",
	                      WebkitLineClamp: 1,
	                      WebkitBoxOrient: "vertical",
	                    }}
	                  >
	                    {m?.artist ?? "Unknown artist"}
	                  </div>
	                  <div className="pageSubtitle">{difficultyLabel}</div>
	                </div>
                <div className="pageSubtitle">{durationLabel}</div>
              </div>

              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "35%",
                    height: "100%",
                    background: "rgba(241,194,75,.45)",
                  }}
                />
              </div>
              <div className="pageSubtitle" style={{ textAlign: "center", marginTop: 10 }}>
                {noteCount > 0 ? `${noteCount} notes extracted` : "Curated for 7 instruments"}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="signOutBtn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setSelectedMusic(m);
                    setIsPreviewOpen(true);
                  }}
                >
                  ▶ Preview
                </button>
                <button
                  type="button"
                  className="signOutBtn"
                  style={{ width: 46, display: "none" }}
                  onClick={() => {
                    setSelectedMusic(m);
                    setIsTransposeOpen(true);
                  }}
                >
                  ⇵
                </button>
                <button
                  type="button"
                  className="signOutBtn"
                  style={{ width: 46 }}
                  aria-label="Delete music"
                  onClick={() => handleDeleteMusic(m)}
                >
                  🗑
                </button>
              </div>

              <button
                type="button"
                className="signOutBtn"
                style={{ width: "100%", marginTop: 10, color: "rgba(216,221,231,.9)" }}
                onClick={() => {
                  setSelectedMusic(m);
                  setIsAssignOpen(true);
                }}
              >
                ＋ Assign
              </button>
            </div>
          );
        })}</div>
      )}

      {false && (
      <div className="card" style={{ maxWidth: 430 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: "rgba(241,194,75,.10)",
              border: "1px solid rgba(241,194,75,.22)",
              color: "rgba(241,194,75,.92)",
              fontWeight: 900,
            }}
          >
            ♪
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>happu</div>
            <div className="pageSubtitle">happy</div>
            <div className="pageSubtitle">medium</div>
          </div>
          <div className="pageSubtitle">0:42</div>
        </div>

        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "35%",
              height: "100%",
              background: "rgba(241,194,75,.45)",
            }}
          />
        </div>
        <div className="pageSubtitle" style={{ textAlign: "center", marginTop: 10 }}>
          Curated for 7 instruments
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            type="button"
            className="signOutBtn"
            style={{ flex: 1 }}
            onClick={() => setIsPreviewOpen(true)}
          >
            ▶ Preview
          </button>
	          <button
	            type="button"
	            className="signOutBtn"
	            style={{ width: 46, display: "none" }}
	            onClick={() => setIsTransposeOpen(true)}
	          >
	            ⇵
	          </button>
          <button type="button" className="signOutBtn" style={{ width: 46 }}>
            🗑
          </button>
        </div>

        <button
          type="button"
          className="signOutBtn"
          style={{ width: "100%", marginTop: 10, color: "rgba(216,221,231,.9)" }}
          onClick={() => setIsAssignOpen(true)}
        >
          ＋ Assign
        </button>
      </div>
      )}

      {isPreviewOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Preview"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <div
            className="modal previewModal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modalTop">
              <div>
                <div className="previewHeaderTitle">{selectedMusic?.title ?? "Preview"}</div>
                <div className="previewHeaderSub">{selectedMusic?.artist ?? ""}</div>
              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => setIsPreviewOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="tabsRow">
              <div className="tabsLeft">
                <div className="pageSubtitle" style={{ marginTop: 0 }}>
                  Preview Sound:
                </div>
                <button
                  type="button"
                  className={
                    "tabPill" + (previewTab === "original" ? " tabPillActive" : "")
                  }
                  onClick={() => setPreviewTab("original")}
                >
                  Original Audio
                </button>
                <button
                  type="button"
                  className={
                    "tabPill" + (previewTab === "synth" ? " tabPillActive" : "")
                  }
                  onClick={() => setPreviewTab("synth")}
                >
                  Synthesized Notes
                </button>
                <button
                  type="button"
                  className={
                    "tabPill" +
                    (previewTab === "instrument" ? " tabPillActive" : "")
                  }
                  onClick={() => setPreviewTab("instrument")}
                >
                  Instrument:
                </button>
                <button
                  type="button"
                  className={
                    "tabPill" + (previewTab === "notation" ? " tabPillActive" : "")
                  }
                  onClick={() => setPreviewTab("notation")}
                  title="Render the saved Klang MusicXML with OpenSheetMusicDisplay (closest to Klangio's website notation view)."
                >
                  Notation
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select
                  className="select"
                  style={{ minWidth: 180 }}
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value as Instrument)}
                >
                  {INSTRUMENTS.map((inst) => (
                    <option key={inst} value={inst}>
                      {inst}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  style={{ minWidth: 160 }}
                  value={noteSource}
                  onChange={(e) => setNoteSource(e.target.value as any)}
                  title="Which Klang output drives the preview notes"
                >
                  <option value="klang_json">Source: Klang JSON</option>
                  <option value="midi_quant">Source: MIDI (quant)</option>
                  <option value="stored">Source: Stored</option>
                </select>

                <select
                  className="select"
                  style={{ minWidth: 160 }}
                  value={pitchDisplay}
                  onChange={(e) => setPitchDisplay(e.target.value as PitchDisplay)}
                  title="Sounding pitch matches the API; written pitch matches common notation conventions"
                >
                  <option value="sounding">Pitch: Sounding</option>
                  <option value="written">Pitch: Written</option>
                </select>

                <label
                  className="pill"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 260,
                    justifyContent: "space-between",
                    opacity: isOriginalPlaying || isSynthPlaying ? 0.6 : 1,
                  }}
                  title={isOriginalPlaying || isSynthPlaying ? "Stop playback to change transposition" : undefined}
                >
                  <span>Transpose {semitones > 0 ? `+${semitones}` : semitones} st</span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={semitones}
                    disabled={isOriginalPlaying || isSynthPlaying}
                    onChange={(e) => setSemitones(Number(e.target.value))}
                    style={{ width: 120 }}
                    aria-label="Preview transposition in semitones"
                  />
                </label>
              </div>
            </div>

            <div className="dividerLine" />

            <div className="pageSubtitle" style={{ marginTop: 14 }}>
              Sheet Music Preview
            </div>
            <div className="sheetPreviewBox" style={{ height: previewSvgHeight }}>
              {previewTab === "notation" ? (
                <div
                  style={{
                    height: "100%",
                    overflow: "auto",
                    borderRadius: 12,
                    border: "1px solid rgba(216,221,231,.12)",
                    background: "#fff",
                    padding: 14,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    {musicXmlRendering ? <span className="pill" style={{ color: "#1b1d24" }}>Rendering MusicXML…</span> : null}
                    {musicXmlWarning ? <span className="pill" style={{ color: "#1b1d24" }}>{musicXmlWarning}</span> : null}
                    {musicXmlError ? <span className="pill" style={{ color: "rgba(180,40,40,.95)" }}>{musicXmlError}</span> : null}
                    <label className="pill" style={{ color: "#1b1d24", display: "flex", alignItems: "center", gap: 10 }}>
                      <span>Zoom</span>
                      <input
                        type="range"
                        min={0.5}
                        max={1.6}
                        step={0.05}
                        value={notationZoom}
                        onChange={(e) => setNotationZoom(Number(e.target.value))}
                        style={{ width: 140 }}
                        aria-label="Notation zoom"
                      />
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{notationZoom.toFixed(2)}x</span>
                    </label>
                  </div>
                  <div ref={musicXmlRef} />
                </div>
              ) : (
                <svg
                  viewBox={`0 0 1000 ${previewSvgHeight}`}
                  width="100%"
                  height="100%"
                  role="img"
                  aria-label={`Sheet music preview for ${instrument}`}
                  onPointerDown={handlePreviewScrubPointerDown}
                  onPointerMove={handlePreviewScrubPointerMove}
                  onPointerUp={handlePreviewScrubPointerUp}
                  onPointerCancel={handlePreviewScrubPointerUp}
                  style={
                    isOriginalPlaying || isSynthPlaying
                      ? { touchAction: "none" }
                      : { cursor: isScrubbing ? "grabbing" : "grab", touchAction: "none" }
                  }
	              >
                <rect x="0" y="0" width="1000" height={previewSvgHeight} fill="rgba(255,255,255,0.01)" />

                {[82, 98, 114, 130, 146].map((y) => (
                  <line
                    key={`staff1-${y}`}
                    x1="30"
                    y1={y}
                    x2="970"
                    y2={y}
                    stroke="rgba(216,221,231,.25)"
                    strokeWidth="1"
                  />
                ))}

                <text
                  x="45"
                  y="112"
                  fill="rgba(216,221,231,.85)"
                  fontSize="30"
                  fontFamily="serif"
                >
                  {previewClefSymbol(previewClef)}
                </text>

                {/* Playhead */}
                <line
                  x1="220"
                  y1="82"
                  x2="220"
                  y2="146"
                  stroke="rgba(241,194,75,.35)"
                  strokeWidth="2"
                />

                {/* Notes: slide under a fixed playhead */}
                {laneGlyphs.map((g, idx) => {
                  const rx = g.isActive ? 12 : 10;
                  const ry = g.isActive ? 9 : 7;
                  const alpha = g.isActive ? 1 : 0.92;
                  const showLetterLabels = String(instrument ?? "").trim().toLowerCase() !== "guitar";
                  const label = showLetterLabels ? formatPracticeMusicalLabel(g.displayPitch, instrument) : "";
                  return (
                    <g key={`${g.startTime}-${g.midi}-${idx}`} opacity={alpha}>
                      {g.ledgerLineYs.map((ledgerY, ledgerIdx) => (
                        <line
                          key={`ledger-${g.startTime}-${g.midi}-${idx}-${ledgerIdx}`}
                          x1={g.x - 16}
                          y1={ledgerY}
                          x2={g.x + 16}
                          y2={ledgerY}
                          stroke={g.isActive ? "rgba(241,194,75,.70)" : "rgba(216,221,231,.45)"}
                          strokeWidth="1.5"
                        />
                      ))}
                      {g.isActive ? (
                        <circle
                          cx={g.x}
                          cy={g.y}
                          r="14"
                          fill="rgba(241,194,75,.18)"
                          stroke="rgba(241,194,75,.55)"
                          strokeWidth="2"
                        />
                      ) : null}
                      <ellipse
                        cx={g.x}
                        cy={g.y}
                        rx={rx}
                        ry={ry}
                        fill={laneNoteFill}
                        transform={`rotate(-20 ${g.x} ${g.y})`}
                      />
                      {label ? (
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
                      ) : null}
                    </g>
                  );
                })}

                {/* TAB lane (only when the server provides tabEvents for this part) */}
                {tabGlyphs.glyphs.length > 0 ? (
                  <g>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <line
                        key={`tab-${i}`}
                        x1="30"
                        y1={tabYTop + i * tabSpacing}
                        x2="970"
                        y2={tabYTop + i * tabSpacing}
                        stroke="rgba(216,221,231,.14)"
                        strokeWidth="1"
                      />
                    ))}

                    {tabGlyphs.barlines.map((x, i) => (
                      <line
                        key={`tab-bar-${i}`}
                        x1={x}
                        y1={tabYTop}
                        x2={x}
                        y2={tabYTop + 5 * tabSpacing}
                        stroke="rgba(216,221,231,.18)"
                        strokeWidth="1"
                      />
                    ))}
                    <text
                      x="36"
                      y={tabYTop - 8}
                      fill="rgba(216,221,231,.32)"
                      fontSize="12"
                      fontFamily="ui-sans-serif, system-ui"
                    >
                      TAB
                    </text>

                    {tabGlyphs.glyphs.map((t) => (
                      <g key={t.key}>
                        {t.isActive ? (
                          <rect
                            x={t.x - 10}
                            y={t.textY - 9}
                            width="20"
                            height="18"
                            rx="6"
                            fill="rgba(241,194,75,.20)"
                            stroke="rgba(241,194,75,.55)"
                            strokeWidth="1.5"
                          />
                        ) : null}
                        <text
                          x={t.x}
                          y={t.textY}
                          textAnchor="middle"
                          fill={t.isActive ? "rgba(241,194,75,.95)" : "rgba(216,221,231,.72)"}
                          fontSize="12"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                          fontWeight={t.isActive ? 700 : 500}
                          dominantBaseline="middle"
                        >
                          {t.fret}
                        </text>
                      </g>
                    ))}
                  </g>
                ) : null}

                <text
                  x="760"
                  y="34"
                  fill="rgba(216,221,231,.45)"
                  fontSize="12"
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {previewTab === "original"
                    ? "Original Audio"
                    : previewTab === "synth"
                      ? `Synthesized (${instrument})`
                      : `Instrument: ${instrument}`}
                </text>

                <text
                  x="760"
                  y="52"
                  fill="rgba(216,221,231,.32)"
                  fontSize="12"
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {noteOffsetSec !== 0
                    ? `Offset: ${noteOffsetSec > 0 ? "+" : ""}${noteOffsetSec.toFixed(2)}s`
                    : ""}
                </text>
              </svg>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <div className="pageSubtitle" style={{ marginTop: 0, minWidth: 110 }}>
                Timing offset:
              </div>
              <button
                type="button"
                className="signOutBtn"
                style={{ padding: "6px 10px" }}
                onClick={() => setNoteOffsetSec((v) => Math.max(-5, Math.round((v - 0.25) * 100) / 100))}
              >
                -0.25s
              </button>
              <button
                type="button"
                className="signOutBtn"
                style={{ padding: "6px 10px" }}
                onClick={() => setNoteOffsetSec((v) => Math.min(5, Math.round((v + 0.25) * 100) / 100))}
              >
                +0.25s
              </button>
              <button
                type="button"
                className="signOutBtn"
                style={{ padding: "6px 10px" }}
                onClick={() => setNoteOffsetSec(0)}
              >
                Reset
              </button>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                {noteOffsetSec > 0 ? "Notes earlier" : noteOffsetSec < 0 ? "Notes later" : ""}
              </div>
            </div>

            <div className="audioBlock">
              <div className="audioTitle">
                <span>▶ Play Original Audio</span>
                <button
                  type="button"
                  className="audioBtn"
                  onClick={handleToggleOriginal}
                  disabled={!audioUrl}
                >
                  {audioUrl ? (isOriginalPlaying ? "Pause" : "Play") : "No audio"}
                </button>
              </div>
              <div className="audioSub">
                Song: {selectedMusic?.title ?? "Unknown"} •{" "}
                {formatDuration(selectedMusic?.duration)}
              </div>
              <audio
                ref={audioRef}
                src={audioUrl ?? undefined}
                onEnded={() => setIsOriginalPlaying(false)}
                style={{ display: "none" }}
              />
            </div>

            <div className="audioBlock">
              <div className="audioTitle">
                <span>🔊 Play Synthesized Notes</span>
                <button
                  type="button"
                  className="audioBtn"
                  onClick={handleToggleSynth}
                  disabled={!selectedMusic?.notes}
                >
                  {isSynthPlaying ? "Stop" : "Play"}
                </button>
              </div>
              <div className="audioSub">
                Automatically transposed for {instrument}
              </div>
            </div>

            <div className="audioBlock">
              <div className="audioTitle">
                <span>⬇ Download Notes</span>
                <button
                  type="button"
                  className="audioBtn"
                  onClick={handleDownloadNotes}
                  disabled={!selectedMusic?.notes}
                >
                  JSON
                </button>
              </div>
              <div className="audioSub">Export extracted notes (JSON)</div>
            </div>

            <div className="audioBlock">
              <div className="audioTitle">
                <span>⬇ Klang Outputs</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioPdfPath}
                    onClick={() => {
                      const url = resolveAudioUrl(API_BASE, selectedMusic?.klangioPdfPath) ?? "";
                      if (!url) return;
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioMxmlPath}
                    onClick={() => {
                      const url = resolveAudioUrl(API_BASE, selectedMusic?.klangioMxmlPath) ?? "";
                      if (!url) return;
                      downloadFromUrl(url, `${String(selectedMusic?.title ?? "score")}.musicxml`);
                    }}
                  >
                    MusicXML
                  </button>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioMxmlPath || !selectedMusic?.id}
                    onClick={() => {
                      const id = Number(selectedMusic?.id ?? 0);
                      if (!Number.isFinite(id) || id <= 0) return;
                      const url = `/instructor/debug/musicxml?id=${encodeURIComponent(String(id))}&instrument=${encodeURIComponent(String(instrument))}`;
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Debug XML
                  </button>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioMidiQuantPath}
                    onClick={() => {
                      const url = resolveAudioUrl(API_BASE, selectedMusic?.klangioMidiQuantPath) ?? "";
                      if (!url) return;
                      downloadFromUrl(url, `${String(selectedMusic?.title ?? "score")}.mid`);
                    }}
                  >
                    MIDI
                  </button>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioGp5Path}
                    onClick={() => {
                      const url = resolveAudioUrl(API_BASE, selectedMusic?.klangioGp5Path) ?? "";
                      if (!url) return;
                      downloadFromUrl(url, `${String(selectedMusic?.title ?? "score")}.gp5`);
                    }}
                  >
                    GP5
                  </button>
                  <button
                    type="button"
                    className="audioBtn"
                    disabled={!selectedMusic?.klangioJsonPath}
                    onClick={() => {
                      const url = resolveAudioUrl(API_BASE, selectedMusic?.klangioJsonPath) ?? "";
                      if (!url) return;
                      downloadFromUrl(url, `${String(selectedMusic?.title ?? "score")}.klang.json`);
                    }}
                  >
                    KJSON
                  </button>
                </div>
              </div>
              <div className="audioSub">
                PDF = view/print, MusicXML = notation, MIDI = playback/DAW, GP5 = guitar tab, KJSON = full multi-part score
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isUploadOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Upload Audio"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsUploadOpen(false);
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">Upload Audio</div>
                <div className="modalSub">
                  Upload an MP3 file. Our AI will automatically convert it to
                  sheet music for all supported instruments.
                </div>
              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => setIsUploadOpen(false)}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="field">
                <div className="label">Title</div>
                <input
                  className="input"
                  placeholder="e.g. Moonlight Sonata"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>

              <div className="field">
                <div className="label">Composer / Artist</div>
                <input
                  className="input"
                  placeholder="e.g. Beethoven"
                  value={uploadComposer}
                  onChange={(e) => setUploadComposer(e.target.value)}
                />
              </div>

              <div className="field">
                <div className="label">Audio File (MP3)</div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,.03)",
                    border: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <label
                    className="modalPrimary"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    Choose File
                    <input
                      type="file"
                      accept=".mp3,audio/mpeg,audio/wav,audio/flac"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setUploadFile(f || null);
                        setUploadFileName(f ? f.name : null);
                      }}
                    />
                  </label>
                  <div className="pageSubtitle" style={{ marginTop: 0 }}>
                    {uploadFileName ?? "No file chosen"}
                  </div>
                </div>
              </div>

              {uploadError && (
                <div style={{ color: "red", marginTop: 10 }}>{uploadError}</div>
              )}
            </div>

            <button
              className="primaryBtn"
              type="button"
              onClick={handleUpload}
              disabled={uploadLoading}
            >
              {uploadLoading ? "Uploading & Converting..." : "Upload & Convert"}
            </button>
          </div>
        </div>
      ) : null}

      {isAssignOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Assign Piece"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsAssignOpen(false);
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">Assign "{selectedMusic?.title ?? "Piece"}"</div>
                <div className="modalSub">
                  Assign this piece to a whole class or individual student.
                </div>
              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => setIsAssignOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="assignModeToggle">
              <button
                type="button"
                className={
                  "assignModeBtn" + (assignMode === "class" ? " assignModeBtnActive" : "")
                }
                onClick={() => {
                  setAssignMode("class");
                  setAssignTarget("");
                }}
              >
                Whole Class
              </button>
              <button
                type="button"
                className={
                  "assignModeBtn" +
                  (assignMode === "student" ? " assignModeBtnActive" : "")
                }
                onClick={() => {
                  setAssignMode("student");
                  setAssignTarget("");
                }}
              >
                Member
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <select
                className="select"
                style={{ width: "100%" }}
                value={assignTarget}
                onChange={(e) => setAssignTarget(e.target.value)}
              >
                <option value="">
                  {assignMode === "class" ? "Select Classroom" : "Select Member"}
                </option>
                {assignMode === "class" ? (
                  classroomOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                ) : (
                  studentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
              {assignOptionsLoading ? (
                <div className="pageSubtitle" style={{ marginTop: 8 }}>
                  Refreshing assignment targets...
                </div>
              ) : null}
            </div>

            <div className="assignConfirmRow">
              <button
                type="button"
                className="assignConfirmBtn"
                onClick={handleAssignPiece}
                disabled={assignLoading || !assignTarget}
              >
                {assignLoading ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTransposeOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Transpose Piece"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsTransposeOpen(false);
          }}
        >
          <div
            className="modal previewModal"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: 980 }}
          >
	            <div className="modalTop">
	              <div>
	                <div className="previewHeaderTitle">Transpose "{selectedMusic?.title ?? "Piece"}"</div>
	                <div className="previewHeaderSub">
	                  Shift all notes up or down by semitones
	                </div>
	              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => setIsTransposeOpen(false)}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
              <div className="sectionTitle" style={{ marginBottom: 0 }}>
                Transpose Amount
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "rgba(241,194,75,.95)" }}>
                {semitones} semitones
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={semitones}
                onChange={(e) => setSemitones(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#f1c24b" }}
              />
              <div
                className="pageSubtitle"
                style={{ marginTop: 2, display: "flex", justifyContent: "space-between" }}
              >
                <span>-12 (1 octave down)</span>
                <span>0 (original)</span>
                <span>+12 (1 octave up)</span>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                Preview as:
              </div>
              <select
                className="select"
                style={{ minWidth: 170 }}
                value={transposeInstrument}
                onChange={(e) => setTransposeInstrument(e.target.value as Instrument)}
              >
                {INSTRUMENTS.map((inst) => (
                  <option key={inst} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>
	              <button type="button" className="audioBtn" onClick={handlePlayTransposePreview}>
	                🔊 Play Notes
	              </button>
            </div>

            <div className="pageSubtitle" style={{ marginTop: 16 }}>
              Transposed Preview
            </div>
            <div className="sheetPreviewBox" style={{ height: 240 }}>
              <svg viewBox="0 0 1000 240" width="100%" height="100%">
                <rect x="0" y="0" width="1000" height="240" fill="rgba(255,255,255,0.01)" />
                {[52, 72, 92, 112, 132].map((y) => (
                  <line
                    key={`t-s-${y}`}
                    x1="30"
                    y1={y}
                    x2="970"
                    y2={y}
                    stroke="rgba(216,221,231,.24)"
                    strokeWidth="1"
                  />
                ))}
                <line x1="430" y1="0" x2="430" y2="240" stroke="rgba(241,194,75,.75)" strokeWidth="2" />
                {[520, 590, 650, 720, 780, 845, 900].map((x, i) => (
                  <g key={`tn-${x}`}>
                    <ellipse
                      cx={x}
                      cy={105 + (i % 3) * 12}
                      rx="10"
                      ry="7"
                      fill="rgba(216,221,231,.94)"
                      transform={`rotate(-20 ${x} ${105 + (i % 3) * 12})`}
                    />
                    <line
                      x1={x + 8}
                      y1={105 + (i % 3) * 12}
                      x2={x + 8}
                      y2={68 + (i % 3) * 12}
                      stroke="rgba(216,221,231,.85)"
                      strokeWidth="2"
                    />
                  </g>
                ))}
              </svg>
            </div>

            <div style={{ marginTop: 10 }}>
              <button type="button" className="audioBtn">
                📄 Download Transposed PDF
              </button>
            </div>

            <div className="modalActions" style={{ gap: 10 }}>
              <button
                type="button"
                className="signOutBtn"
                style={{ width: "auto", marginTop: 0 }}
                onClick={() => setIsTransposeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="assignConfirmBtn"
                onClick={() => setIsTransposeOpen(false)}
              >
                Apply Transpose
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

