import { GROQ_SYSTEM_PROMPT } from "./prompt";

export interface GroqOption {
  label: string;
  description: string;
}

export interface GroqResponse {
  state: string;
  refusal: boolean;
  options: [GroqOption, GroqOption, GroqOption, GroqOption];
  timing: number;
}

export function validateGroqPayload(parsed: any): {
  valid: boolean;
  state: string;
  refusal: boolean;
  options: [GroqOption, GroqOption, GroqOption, GroqOption] | null;
} {
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, state: "", refusal: false, options: null };
  }

  const state = typeof parsed.state === "string" ? parsed.state.trim() : "";
  const refusal = Boolean(parsed.refusal);

  if (!Array.isArray(parsed.options) || parsed.options.length !== 4) {
    return { valid: false, state: "", refusal: false, options: null };
  }

  for (let i = 0; i < 4; i++) {
    const opt = parsed.options[i];
    if (!opt || typeof opt !== "object") {
      return { valid: false, state: "", refusal: false, options: null };
    }
    const label = typeof opt.label === "string" ? opt.label.trim() : "";
    const description = typeof opt.description === "string" ? opt.description.trim() : "";
    if (!label || !description) {
      return { valid: false, state: "", refusal: false, options: null };
    }
  }

  const cleanOptions = parsed.options.map((opt: any) => ({
    label: opt.label.trim(),
    description: opt.description.trim(),
  })) as [GroqOption, GroqOption, GroqOption, GroqOption];

  return {
    valid: true,
    state: state || "The robots contemplate the prompt.",
    refusal,
    options: cleanOptions,
  };
}

async function executeGroqRequest(apiKey: string, question: string): Promise<any> {
  const body = {
    model: "llama-3.3-70b-versatile",
    temperature: 0.95,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: GROQ_SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Groq HTTP ${res.status}: ${res.statusText}`);
  }

  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Missing choice content in Groq response");
  }

  return JSON.parse(content);
}

export async function callGroqWithRetry(apiKey: string, question: string): Promise<GroqResponse | null> {
  const startTime = Date.now();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await executeGroqRequest(apiKey, question);
      const validation = validateGroqPayload(parsed);
      if (validation.valid && validation.options) {
        return {
          state: validation.state,
          refusal: validation.refusal,
          options: validation.options,
          timing: Date.now() - startTime,
        };
      }
    } catch (err) {
      if (attempt === 2) {
        console.error("Groq attempt 2 failed:", err);
      }
    }
  }

  return null;
}
