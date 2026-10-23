import { validateQuestion, sha256Hex } from "./validate";
import { buildDecideResponse, DecideResponse } from "./normalize";
import { callGroqWithRetry, GroqOption } from "./groq";

export interface Env {
  GROQ_API_KEY?: string;
  BASETEN_API_KEY?: string;
  MAMMOTH_KV?: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export function errorResponse(code: "BAD_INPUT" | "UPSTREAM" | "RATE_LIMIT", message: string, status = 400): Response {
  return jsonResponse(
    {
      error: { code, message },
    },
    status
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (url.pathname === "/api/decide" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return errorResponse("BAD_INPUT", "Malformed JSON body.", 400);
      }

      const validation = validateQuestion(body?.question);
      if (!validation.valid) {
        return errorResponse("BAD_INPUT", validation.error || "Invalid question.", 400);
      }

      const hash = await sha256Hex(validation.normalized);

      let state = "The user asks a question.";
      let options: [GroqOption, GroqOption, GroqOption, GroqOption];
      let groqTiming = 0;

      if (env.GROQ_API_KEY) {
        const groqResult = await callGroqWithRetry(env.GROQ_API_KEY, validation.normalized);
        if (!groqResult) {
          return errorResponse("UPSTREAM", "The robots were unable to formulate decisions.", 502);
        }
        state = groqResult.state;
        options = groqResult.options;
        groqTiming = groqResult.timing;
      } else {
        // Fallback options when key is not configured (e.g. testing)
        options = [
          { label: "Absolutely not", description: "Choosing this rejects the premise outright." },
          { label: "Do it now", description: "Choosing this encourages immediate and fearless action." },
          { label: "Eat a shoe instead", description: "Choosing this redirects all energy toward footwear consumption." },
          { label: "The void awaits", description: "Choosing this concedes to impending entropy." },
        ];
        groqTiming = 5;
      }

      // In M5, Mammoth is still mocked; real Mammoth adapter comes in M6
      const decideResponse: DecideResponse = buildDecideResponse({
        id: hash,
        state,
        rawOptions: options,
        probabilities: [0.15, 0.55, 0.2, 0.1],
        fallback: false,
        cached: false,
        timings: { groq: groqTiming, mammoth: 0 },
      });

      return jsonResponse(decideResponse, 200);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
