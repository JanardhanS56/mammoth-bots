import { validateQuestion, sha256Hex } from "./validate";
import { buildDecideResponse, DecideResponse } from "./normalize";
import { callGroqWithRetry, GroqOption } from "./groq";
import { scoreOptions } from "./mammoth";
import { getCachedDecide, setCachedDecide, checkRateLimit } from "./cache";

export interface Env {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  BASETEN_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  MAMMOTH_MODEL?: string;
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
      const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";

      // Rate limit check: 10 requests / hour per IP
      const rateLimit = await checkRateLimit(env.MAMMOTH_KV, clientIp);
      if (!rateLimit.allowed) {
        return errorResponse("RATE_LIMIT", "the robots need a break", 429);
      }

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

      // Server KV cache check (TTL 24h)
      const cached = await getCachedDecide(env.MAMMOTH_KV, hash);
      if (cached) {
        return jsonResponse(cached, 200);
      }

      let state = "The user contemplates their options.";
      let options: [GroqOption, GroqOption, GroqOption, GroqOption];
      let groqTiming = 0;

      const groqKey = env.GROQ_API_KEY;
      const groqModel = env.GROQ_MODEL;

      if (groqKey) {
        const groqResult = await callGroqWithRetry(groqKey, validation.normalized, groqModel);
        if (!groqResult) {
          return errorResponse("UPSTREAM", "The robots were unable to formulate decisions.", 502);
        }
        state = groqResult.state;
        options = groqResult.options;
        groqTiming = groqResult.timing;
      } else {
        options = [
          { label: "Absolutely not", description: "Choosing this rejects the premise outright." },
          { label: "Do it now", description: "Choosing this encourages immediate and fearless action." },
          { label: "Eat a shoe instead", description: "Choosing this redirects all energy toward footwear consumption." },
          { label: "The void awaits", description: "Choosing this concedes to impending entropy." },
        ];
        groqTiming = 10;
      }

      // Mammoth-1 decision model scoring via vendor firewall
      const mammothKey = env.BASETEN_API_KEY || env.OPENROUTER_API_KEY;
      const mammothModel = env.MAMMOTH_MODEL;
      const mammothResult = await scoreOptions(mammothKey, state, options, mammothModel);

      const decideResponse: DecideResponse = buildDecideResponse({
        id: hash,
        state,
        rawOptions: options,
        probabilities: mammothResult.p,
        fallback: !mammothResult.ok,
        cached: false,
        timings: { groq: groqTiming, mammoth: mammothResult.timing },
      });

      // Save to KV cache
      await setCachedDecide(env.MAMMOTH_KV, hash, decideResponse);

      return jsonResponse(decideResponse, 200);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
