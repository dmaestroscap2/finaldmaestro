import React from "react";
import { PageHeader } from "../../shared/PageHeader";
import { INSTRUMENTS, type Instrument } from "../../data/instruments";
import { midiToPitch, transposePitch, transpositionForInstrument, type PitchDisplay } from "../musicPreview.utils";
import {
  buildPracticeAudioConstraints,
  detectPitchHzWithConfig,
  frequencyToMidi,
  stabiliseDetectedMidi,
  DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG,
} from "./studentPracticePitch.utils";

export function StudentTrainerPage() {
  const [instrument, setInstrument] = React.useState<Instrument>("piano");
  const [pitchDisplay, setPitchDisplay] = React.useState<PitchDisplay>("written");
  const [isRunning, setIsRunning] = React.useState(false);
  const [micStatus, setMicStatus] = React.useState<"idle" | "requesting" | "ready" | "denied" | "unsupported">("idle");

  const [frequencyHz, setFrequencyHz] = React.useState<number | null>(null);
  const [stableMidi, setStableMidi] = React.useState<number | null>(null);
  const [cents, setCents] = React.useState<number>(0);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const detectionIntervalRef = React.useRef<number | null>(null);
  const midiHistoryRef = React.useRef<number[]>([]);

  const stop = React.useCallback(async () => {
    if (detectionIntervalRef.current != null) {
      window.clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    analyserRef.current = null;
    midiHistoryRef.current = [];

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) track.stop();
      micStreamRef.current = null;
    }

    setIsRunning(false);
    setMicStatus("idle");
    setFrequencyHz(null);
    setStableMidi(null);
    setCents(0);
  }, []);

  React.useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const startOrStop = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      return;
    }

    if (isRunning) {
      await stop();
      return;
    }

    setMicStatus("requesting");
    try {
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.();
      const stream = await navigator.mediaDevices.getUserMedia(buildPracticeAudioConstraints(supportedConstraints));
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setMicStatus("ready");
      setIsRunning(true);

      const buffer = new Float32Array(analyser.fftSize);
      detectionIntervalRef.current = window.setInterval(() => {
        const analyserNode = analyserRef.current;
        const ctx = audioContextRef.current;
        if (!analyserNode || !ctx) return;

        analyserNode.getFloatTimeDomainData(buffer);
        const pitchHz = detectPitchHzWithConfig(buffer, ctx.sampleRate, DEFAULT_PRACTICE_PITCH_DETECTION_CONFIG);
        if (pitchHz == null) {
          midiHistoryRef.current = [];
          setFrequencyHz(null);
          setStableMidi(null);
          setCents(0);
          return;
        }

        setFrequencyHz(pitchHz);
        const midi = frequencyToMidi(pitchHz);
        const stable = stabiliseDetectedMidi(midiHistoryRef.current, midi);
        midiHistoryRef.current = stable.history;
        setStableMidi(stable.stableMidi);

        const targetMidi = stable.stableMidi ?? midi;
        if (targetMidi == null) {
          setCents(0);
          return;
        }
        const refHz = 440 * 2 ** ((targetMidi - 69) / 12);
        const delta = 1200 * Math.log2(pitchHz / refHz);
        setCents(Number.isFinite(delta) ? Math.max(-99, Math.min(99, delta)) : 0);
      }, 70);
    } catch {
      setMicStatus("denied");
      setIsRunning(false);
    }
  }, [isRunning, stop]);

  const displayedPitch = React.useMemo(() => {
    if (stableMidi == null) return null;
    const sounding = midiToPitch(stableMidi);
    if (pitchDisplay === "sounding") return sounding;
    const shift = transpositionForInstrument(instrument);
    if (shift === 0) return sounding;
    return transposePitch(sounding, shift) ?? sounding;
  }, [stableMidi, pitchDisplay, instrument]);

  const centsClamped = Number.isFinite(cents) ? Math.max(-50, Math.min(50, cents)) : 0;
  const meterPct = ((centsClamped + 50) / 100) * 100;

  const statusLabel =
    frequencyHz == null ? "Silence" : displayedPitch ? displayedPitch : "Listening…";

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
      <PageHeader title="Instrument Trainer" subtitle={`Precision tuning and training for your ${instrument}.`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        <div className="card" style={{ minHeight: 320 }}>
          <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
            ♪ <span>Live Tuner</span>
          </div>
          <div className="pageSubtitle">
            Detecting: <span className="pill">{instrument}</span> <span className="pill">{micLabel}</span>
          </div>

          <div
            style={{
              marginTop: 24,
              height: 220,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.06)",
              background: "rgba(255,255,255,.02)",
              display: "grid",
              placeItems: "center",
              color: "rgba(216,221,231,.82)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ letterSpacing: ".12em", marginBottom: 8, opacity: 0.7 }}>
                {frequencyHz == null ? "▮▮" : "♪♪"}
              </div>
              <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 30 }}>{statusLabel}</div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                {frequencyHz != null ? `${frequencyHz.toFixed(1)} Hz` : "Play a note to begin"}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: 360,
                  maxWidth: "100%",
                  fontSize: 11,
                  opacity: 0.8,
                  marginTop: 14,
                }}
              >
                <span>Low</span>
                <span>Perfect</span>
                <span>High</span>
              </div>
              <div
                style={{
                  marginTop: 10,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.06)",
                  position: "relative",
                  width: 360,
                  maxWidth: "100%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${meterPct}% - 6px)`,
                    top: -6,
                    width: 12,
                    height: 20,
                    borderRadius: 6,
                    background: "rgba(241,194,75,.85)",
                    boxShadow: "0 0 18px rgba(241,194,75,.25)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -3,
                    width: 2,
                    height: 14,
                    background: "rgba(216,221,231,.35)",
                  }}
                />
              </div>
              <div style={{ marginTop: 10, fontWeight: 900 }}>
                {frequencyHz == null ? "0 cents" : `${Math.round(cents)} cents`}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="sectionTitle">Controls</div>

            <div style={{ marginTop: 12 }}>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                Instrument
              </div>
              <select
                className="select"
                style={{ width: "100%", marginTop: 6 }}
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as Instrument)}
                disabled={isRunning}
              >
                {INSTRUMENTS.map((inst) => (
                  <option key={inst} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>

              <div className="pageSubtitle" style={{ marginTop: 10 }}>
                Pitch Display
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className={"tabPill" + (pitchDisplay === "written" ? " tabPillActive" : "")}
                  onClick={() => setPitchDisplay("written")}
                  style={{ marginTop: 0, flex: 1 }}
                >
                  Written
                </button>
                <button
                  type="button"
                  className={"tabPill" + (pitchDisplay === "sounding" ? " tabPillActive" : "")}
                  onClick={() => setPitchDisplay("sounding")}
                  style={{ marginTop: 0, flex: 1 }}
                >
                  Sounding
                </button>
              </div>
            </div>

            <button className="primaryBtn" type="button" style={{ marginTop: 12 }} onClick={startOrStop}>
              {isRunning ? "⏹ Stop Training" : "🎙 Start Training"}
            </button>
            <button className="signOutBtn" type="button" style={{ marginTop: 10 }} disabled title="Coming soon">
              ⊕ Calibration
            </button>
          </div>

          <div className="card">
            <div className="sectionTitle">Tips</div>
            <div className="pageSubtitle" style={{ marginTop: 8, lineHeight: 1.6 }}>
              - Ensure you are in a quiet room.
              <br />- Play a single note at a time for best accuracy.
              <br />- The center line indicates perfect tuning.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

