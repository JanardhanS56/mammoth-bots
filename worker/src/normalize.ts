export type OptionSlot = "no" | "yes" | "jester" | "prophet";

export const SLOTS: readonly OptionSlot[] = ["no", "yes", "jester", "prophet"] as const;

export interface Option {
  id: 0 | 1 | 2 | 3;
  slot: OptionSlot;
  label: string;
  description: string;
  p: number;
}

export interface RawOptionInput {
  label: string;
  description: string;
}

export interface DecideResponse {
  id: string;
  state: string;
  options: [Option, Option, Option, Option];
  chosenId: 0 | 1 | 2 | 3;
  margin: number;
  coinFlip: boolean;
  fallback: boolean;
  cached: boolean;
  timings: { groq: number; mammoth: number };
}

export function buildDecideResponse(params: {
  id: string;
  state: string;
  rawOptions: RawOptionInput[];
  probabilities: number[];
  fallback: boolean;
  cached: boolean;
  timings: { groq: number; mammoth: number };
}): DecideResponse {
  const { id, state, rawOptions, probabilities, fallback, cached, timings } = params;

  // Normalize probabilities to sum to 1.0
  let p = probabilities.slice(0, 4);
  if (p.length < 4) {
    p = [0.25, 0.25, 0.25, 0.25];
  }
  const sum = p.reduce((a, b) => a + b, 0);
  const normalizedP = sum > 0 ? p.map((val) => Number((val / sum).toFixed(4))) : [0.25, 0.25, 0.25, 0.25];

  // Adjust last item to ensure sum is exactly 1.0
  const adjustedSum = normalizedP[0] + normalizedP[1] + normalizedP[2];
  normalizedP[3] = Number((1 - adjustedSum).toFixed(4));

  const options = SLOTS.map((slot, index) => ({
    id: index as 0 | 1 | 2 | 3,
    slot,
    label: rawOptions[index]?.label || slot,
    description: rawOptions[index]?.description || "",
    p: normalizedP[index],
  })) as [Option, Option, Option, Option];

  // Find chosenId (argmax) and runner-up for margin calculation
  const indexed = normalizedP.map((val, idx) => ({ idx: idx as 0 | 1 | 2 | 3, val }));
  indexed.sort((a, b) => b.val - a.val);

  const top1 = indexed[0];
  const top2 = indexed[1];
  const margin = Number((top1.val - top2.val).toFixed(4));
  const coinFlip = margin < 0.05;

  return {
    id,
    state,
    options,
    chosenId: top1.idx,
    margin,
    coinFlip,
    fallback,
    cached,
    timings,
  };
}
