import { validateQuestion, sha256Hex } from "./validate";
import { buildDecideResponse, DecideResponse } from "./normalize";

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
  async fetch(request: Request, _env: Env): Promise<Response> {
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

      // M4: Hardcoded fake data
      const fakeOptions = [
        { label: "Absolutely not", description: "Choosing this rejects the premise outright." },
        { label: "Do it now", description: "Choosing this encourages immediate and fearless action." },
        { label: "Eat a shoe instead", description: "Choosing this redirects all energy toward footwear consumption." },
        { label: "The void awaits", description: "Choosing this concedes to impending entropy." },
      ];

      const decideResponse: DecideResponse = buildDecideResponse({
        id: hash,
        state: "The user is contemplating whether to proceed.",
        rawOptions: fakeOptions,
        probabilities: [0.15, 0.55, 0.2, 0.1],
        fallback: false,
        cached: false,
        timings: { groq: 120, mammoth: 180 },
      });

      return jsonResponse(decideResponse, 200);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
