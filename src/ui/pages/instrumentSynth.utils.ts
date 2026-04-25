export type InstrumentSynth = {
  triggerAttackRelease: (note: string, duration: number, time?: number, velocity?: number) => void;
  dispose: () => void;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normaliseInstrumentName(instrument: string | null | undefined): string {
  return String(instrument ?? "").trim().toLowerCase();
}

export function createInstrumentSynth(Tone: any, instrument: string | null | undefined): InstrumentSynth {
  const inst = normaliseInstrumentName(instrument);

  const disposables: any[] = [];
  const output = new Tone.Gain(0.9).toDestination();
  disposables.push(output);

  // IMPORTANT: Use algorithmic reverb (JCReverb) to avoid async IR generation latency
  // that can make the first notes sound out-of-sync.
  const reverb = Tone.JCReverb ? new Tone.JCReverb({ roomSize: 0.35, wet: 0.12 }) : new Tone.Freeverb({ roomSize: 0.35, dampening: 2500, wet: 0.12 });
  const limiter = new Tone.Limiter(-1);
  const eq = new Tone.EQ3({ low: -1, mid: 0, high: 1 });
  limiter.connect(eq);
  eq.connect(reverb);
  reverb.connect(output);
  disposables.push(reverb, limiter, eq);

  const connectVoice = (voice: any, gain = 1, effect: any | null = null) => {
    const g = new Tone.Gain(clamp(gain, 0, 2));
    disposables.push(g);
    try {
      if ("volume" in voice) voice.volume = -6;
    } catch {
      // ignore
    }

    voice.connect(g);
    if (effect) {
      g.connect(effect);
      effect.connect(limiter);
    } else {
      g.connect(limiter);
    }
    return voice;
  };

  const makePoly = (VoiceCtor: any, opts: any, gain = 1) => {
    const poly = new Tone.PolySynth(VoiceCtor, opts);
    disposables.push(poly);
    return { poly, gain };
  };

  // Defaults: a reasonably musical envelope for general playback.
  const defaultPoly = () =>
    makePoly(
      Tone.Synth,
      {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.9 },
      },
      1
    );

  let synth: any;
  let voiceGain = 1;
  let isManuallyConnected = false;
  let guitarVoices: any[] | null = null;
  let guitarVoiceIndex = 0;

  if (inst === "piano") {
    const built = makePoly(
      Tone.Synth,
      {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.003, decay: 0.25, sustain: 0.1, release: 1.3 },
      },
      1
    );
    synth = built.poly;
    voiceGain = built.gain;
    // Slightly more room for piano.
    try {
      reverb.wet.value = 0.18;
    } catch {
      // ignore
    }
  } else if (inst === "guitar") {
    // Prefer a Karplus-Strong style pluck when available to sound more like a guitar.
    // Avoid PolySynth(PluckSynth) to reduce "silent voice" risk; use a small voice pool instead.
    if (Tone.PluckSynth) {
      isManuallyConnected = true;

      const guitarMix = new Tone.Gain(1.0);
      disposables.push(guitarMix);

      let node: any = guitarMix;
      try {
        if (Tone.Distortion) {
          const dist = new Tone.Distortion(0.15);
          disposables.push(dist);
          try {
            dist.wet.value = 0.22;
          } catch {
            // ignore
          }
          node.connect(dist);
          node = dist;
        }
      } catch {
        // ignore
      }

      try {
        if (Tone.Filter) {
          const filter = new Tone.Filter({ type: "lowpass", frequency: 6500, Q: 0.7 });
          disposables.push(filter);
          node.connect(filter);
          node = filter;
        }
      } catch {
        // ignore
      }

      node.connect(limiter);

      // Slightly drier than piano to keep plucks crisp.
      try {
        reverb.wet.value = 0.08;
      } catch {
        // ignore
      }

      // A touch more bite in the highs.
      try {
        eq.low.value = -0.4;
        eq.mid.value = 0.4;
        eq.high.value = 1.4;
      } catch {
        // ignore
      }

      const voiceCount = 8;
      guitarVoices = Array.from({ length: voiceCount }, () => {
        const v = new Tone.PluckSynth({
          attackNoise: 1.0,
          dampening: 2800,
          resonance: 0.92,
        });
        disposables.push(v);
        try {
          if ("volume" in v) v.volume = -8;
        } catch {
          // ignore
        }
        v.connect(guitarMix);
        return v;
      });

      synth = guitarVoices[0];
      voiceGain = 1;
    } else {
      const built = makePoly(
        Tone.Synth,
        {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.002, decay: 0.12, sustain: 0.0, release: 0.6 },
        },
        1.15
      );
      synth = built.poly;
      voiceGain = built.gain;
      try {
        reverb.wet.value = 0.1;
      } catch {
        // ignore
      }
    }
  } else if (inst === "xylophone") {
    const built = makePoly(
      Tone.FMSynth,
      {
        harmonicity: 3,
        modulationIndex: 10,
        oscillator: { type: "sine" },
        modulation: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.4 },
        modulationEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.2 },
      },
      1.05
    );
    synth = built.poly;
    voiceGain = built.gain;
    try {
      reverb.wet.value = 0.08;
    } catch {
      // ignore
    }
  } else if (inst === "clarinet") {
    const built = makePoly(
      Tone.MonoSynth,
      {
        oscillator: { type: "square" },
        filter: { Q: 1, type: "lowpass", rolloff: -24, frequency: 1800 },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.25 },
        filterEnvelope: { attack: 0.01, decay: 0.08, sustain: 0.4, release: 0.2, baseFrequency: 450, octaves: 2.1 },
      },
      0.95
    );
    synth = built.poly;
    voiceGain = built.gain;
  } else if (inst === "saxophone") {
    const built = makePoly(
      Tone.MonoSynth,
      {
        oscillator: { type: "sawtooth" },
        filter: { Q: 0.8, type: "lowpass", rolloff: -24, frequency: 2400 },
        envelope: { attack: 0.015, decay: 0.12, sustain: 0.6, release: 0.28 },
        filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.22, baseFrequency: 600, octaves: 2.4 },
      },
      0.95
    );
    synth = built.poly;
    voiceGain = built.gain;
  } else if (inst === "trumpet") {
    const built = makePoly(
      Tone.MonoSynth,
      {
        oscillator: { type: "sawtooth" },
        filter: { Q: 0.6, type: "lowpass", rolloff: -12, frequency: 3200 },
        envelope: { attack: 0.008, decay: 0.14, sustain: 0.65, release: 0.22 },
        filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.5, release: 0.18, baseFrequency: 900, octaves: 2.8 },
      },
      1.0
    );
    synth = built.poly;
    voiceGain = built.gain;
    try {
      eq.high.value = 1.8;
    } catch {
      // ignore
    }
  } else if (inst === "trombone") {
    const built = makePoly(
      Tone.MonoSynth,
      {
        oscillator: { type: "sawtooth" },
        filter: { Q: 0.7, type: "lowpass", rolloff: -24, frequency: 2200 },
        envelope: { attack: 0.012, decay: 0.16, sustain: 0.7, release: 0.28 },
        filterEnvelope: { attack: 0.008, decay: 0.14, sustain: 0.5, release: 0.22, baseFrequency: 650, octaves: 2.3 },
      },
      0.95
    );
    synth = built.poly;
    voiceGain = built.gain;
    try {
      eq.high.value = 0.5;
      eq.low.value = 0.6;
    } catch {
      // ignore
    }
  } else {
    const built = defaultPoly();
    synth = built.poly;
    voiceGain = built.gain;
  }

  // Light vibrato for winds/brass.
  let effect: any | null = null;
  if (["clarinet", "saxophone", "trumpet", "trombone"].includes(inst) && Tone.Vibrato) {
    try {
      effect = new Tone.Vibrato(5, 0.12);
      disposables.push(effect);
    } catch {
      effect = null;
    }
  }

  if (!isManuallyConnected) {
    connectVoice(synth, voiceGain, effect);
  }

  const triggerAttackRelease = (note: string, duration: number, time?: number, velocity?: number) => {
    const dur = Number.isFinite(duration) ? Math.max(0.03, duration) : 0.12;
    const vel = clamp(typeof velocity === "number" && Number.isFinite(velocity) ? velocity : 0.6, 0, 1);
    try {
      if (guitarVoices && guitarVoices.length > 0) {
        const v = guitarVoices[guitarVoiceIndex % guitarVoices.length]!;
        guitarVoiceIndex++;
        if (typeof v.triggerAttackRelease === "function") {
          v.triggerAttackRelease(note, dur, time, vel);
        } else if (typeof v.triggerAttack === "function" && typeof v.triggerRelease === "function") {
          const t = typeof time === "number" ? time : undefined;
          v.triggerAttack(note, t, vel);
          v.triggerRelease((typeof t === "number" ? t : 0) + dur);
        }
        return;
      }

      synth.triggerAttackRelease(note, dur, time, vel);
    } catch {
      // ignore individual note failures
    }
  };

  const dispose = () => {
    for (const node of disposables) {
      try {
        node.dispose?.();
      } catch {
        // ignore
      }
    }
  };

  return { triggerAttackRelease, dispose };
}
