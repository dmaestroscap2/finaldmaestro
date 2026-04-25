export const INSTRUMENTS = [
  "piano",
  "guitar",
  "trumpet",
  "saxophone",
  "clarinet",
  "trombone",
  "xylophone",
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];
