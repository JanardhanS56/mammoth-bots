import type { GroqOption } from "./groq";

export interface MammothResult {
  p: number[];
  chosenIndex: number;
  ok: boolean;
  timing: number;
}

const UNIFORM_P = [0.25, 0.25, 0.25, 0.25];

/**
 * VENDOR FIREWALL.
 * ALL knowledge of Mammoth's wire format lives in this file.
 * No other file may know the vendor's field names.
 */
export function extractProbabilities(
  json: any,
  options: GroqOption[]
): { p: number[]; chosenIndex: number; ok: boolean } {
  try {
    if (!json || typeof json !== "object") {
      return { p: [...UNIFORM_P], chosenIndex: 0, ok: false };
    }

    const rawProbs: number[] = [];

    // Case A: Top-level probabilities array [0.1, 0.5, 0.2, 0.2]
    if (Array.isArray(json.probabilities) && json.probabilities.length === 4) {
      for (const val of json.probabilities) {
        const num = typeof val === "number" ? val : parseFloat(val);
        rawProbs.push(isNaN(num) ? 0.25 : Math.max(0, num));
      }
    }

    // Case B: questions array with options containing probability/p/score
    if (rawProbs.length === 0 && Array.isArray(json.questions) && json.questions[0]?.options) {
      const qOptions = json.questions[0].options;
      if (Array.isArray(qOptions) && qOptions.length === 4) {
        for (let i = 0; i < 4; i++) {
          const opt = qOptions[i];
          const val = opt?.probability ?? opt?.p ?? opt?.score ?? opt?.weight;
          const num = typeof val === "number" ? val : parseFloat(val);
          rawProbs.push(isNaN(num) ? 0.25 : Math.max(0, num));
        }
      }
    }

    // Case C: result array or object with probabilities map { [label]: score }
    if (rawProbs.length === 0) {
      const probMap =
        json.result?.[0]?.probabilities ||
        json.answers?.[0]?.probabilities ||
        json.output?.probabilities ||
        json.probabilities;

      if (probMap && typeof probMap === "object" && !Array.isArray(probMap)) {
        for (const opt of options) {
          const val = probMap[opt.label] ?? probMap[opt.label.toLowerCase()];
          const num = typeof val === "number" ? val : parseFloat(val);
          rawProbs.push(isNaN(num) ? 0.25 : Math.max(0, num));
        }
      }
    }

    // Validation: must have 4 non-NaN values
    if (rawProbs.length !== 4 || rawProbs.some((v) => isNaN(v))) {
      return { p: [...UNIFORM_P], chosenIndex: 0, ok: false };
    }

    const sum = rawProbs.reduce((acc, v) => acc + v, 0);
    if (sum <= 0) {
      return { p: [...UNIFORM_P], chosenIndex: 0, ok: false };
    }

    // Normalize probabilities to sum to ~1.0
    const normalized = rawProbs.map((v) => Number((v / sum).toFixed(4)));

    // Pick argmax for chosenIndex
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] > maxVal) {
        maxVal = normalized[i];
        maxIdx = i;
      }
    }

    return { p: normalized, chosenIndex: maxIdx, ok: true };
  } catch {
    return { p: [...UNIFORM_P], chosenIndex: 0, ok: false };
  }
}

export async function scoreOptions(
  apiKey: string | undefined,
  state: string,
  options: GroqOption[]
): Promise<MammothResult> {
  const startTime = Date.now();

  if (!apiKey) {
    return {
      p: [...UNIFORM_P],
      chosenIndex: 0,
      ok: false,
      timing: 0,
    };
  }

  const body = {
    model: "decision-models/baseten-mammoth-27b-latest",
    state,
    questions: [
      {
        key: "verdict",
        type: "choice",
        text: "How should this be answered?",
        options: options.map((o) => ({
          label: o.label,
          description: o.description,
        })),
      },
    ],
  };

  try {
    const res = await fetch("https://inference.baseten.co/v1/decision", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        p: [...UNIFORM_P],
        chosenIndex: 0,
        ok: false,
        timing: Date.now() - startTime,
      };
    }

    const json: any = await res.json();
    const extracted = extractProbabilities(json, options);

    return {
      p: extracted.p,
      chosenIndex: extracted.chosenIndex,
      ok: extracted.ok,
      timing: Date.now() - startTime,
    };
  } catch {
    return {
      p: [...UNIFORM_P],
      chosenIndex: 0,
      ok: false,
      timing: Date.now() - startTime,
    };
  }
}
