import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import worker from "../worker/src/index";

function readEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const res: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > -1) {
      res[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return res;
}

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    {
      name: "api-dev-server",
      configureServer(server) {
        const envVars = readEnv();
        const workerEnv = {
          GROQ_API_KEY: envVars.groq_api_key,
          GROQ_MODEL: envVars.groq_model_name,
          OPENROUTER_API_KEY: envVars.open_router_api_key,
          MAMMOTH_MODEL: envVars.model_name,
        };

        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/decide")) {
            const url = `http://${req.headers.host || "localhost"}${req.url}`;
            const chunks: any[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", async () => {
              const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
              const webReq = new Request(url, {
                method: req.method,
                headers: req.headers as any,
                body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
              });

              try {
                const workerRes = await worker.fetch(webReq, workerEnv);
                res.statusCode = workerRes.status;
                workerRes.headers.forEach((val, key) => res.setHeader(key, val));
                const text = await workerRes.text();
                res.end(text);
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: { code: "UPSTREAM", message: err.message } }));
              }
            });
            return;
          }
          next();
        });
      },
    },
  ],
  test: {
    environment: "happy-dom",
  },
});
