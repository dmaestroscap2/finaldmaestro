function numberToWord(n: number): string | null {
  const map: Record<number, string> = {
    0: "zero",
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve",
    13: "thirteen",
    14: "fourteen",
    15: "fifteen",
    16: "sixteen",
    17: "seventeen",
    18: "eighteen",
    19: "nineteen",
    20: "twenty",
  };
  return map[n] ?? null;
}

function stripPitchOctave(pitch: string): string | null {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(pitch.trim());
  if (!m) return null;
  return `${m[1]!}${m[2] ?? ""}`;
}

export function formatPracticeMusicalLabel(label: string | null | undefined, instrument: string | null | undefined): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "";

  const inst = String(instrument ?? "").trim().toLowerCase();
  if (inst === "guitar") return raw;

  // Common pitch names include octave digits (e.g. C#4). Strip octave to avoid digits in non-guitar UI.
  const stripped = stripPitchOctave(raw);
  if (stripped) return stripped;

  // For chord-like labels, convert digits to words (e.g. Bm7 -> Bm seven) so no numeric characters appear.
  return raw
    .replace(/\d+/g, (digits) => {
      const num = Number.parseInt(digits, 10);
      if (!Number.isFinite(num)) return "";
      const word = numberToWord(num);
      return word ? ` ${word}` : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

