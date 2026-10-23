# Mammoth Bots — Implementation Docs

**One-line concept:** A webpage where four tiny robots live. You type a question (≤100 chars), Groq rewrites it into a structured decision with four funny options, Mammoth-1 scores those options probabilistically, and the robots physically become those probabilities. They remember losing.

---

## 1. Scope

### In scope (v1)
| # | Feature | Status |
|---|---|---|
| 1 | Canvas scene with 4 wandering bots | Required |
| 2 | 100-char question input | Required |
| 3 | Groq → structured `state` + 4 ordered options | Required |
| 4 | Mammoth-1 choice question → probabilities | Required |
| 5 | Probability → bot body language reveal | Required |
| 6 | **Nerd mode** (stretch 1) | Required |
| 7 | **Persistent bots / streaks / moods** (stretch 3) | Required |
| 8 | Result caching (sessionStorage + server KV) | Required |
| 9 | Graceful failure with comedic fallback | Required |

### Explicitly out of scope (v2)
- Verdict ticker along the bottom
- Multi-question Mammoth calls
- Accounts / cross-device persistence
- Sharing / permalinks
- Moderation API (use a prompt-level refusal flag instead)

**Cut scope ruthlessly.** This project is won by the reveal animation and the sulking robot. Everything else is scaffolding.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend build | **Vite + TypeScript** | Instant HMR, zero-config, tiny output |
| UI | **Vanilla TS + Canvas 2D** | No framework needed. React adds 45KB to draw 4 rectangles. Canvas gives you smooth morph/scale that DOM transforms make fiddly. |
| Backend | **Cloudflare Worker** (plain `fetch` handler) | Keys stay server-side, free tier covers this comfortably, sub-50ms cold start, built-in KV for caching |
| LLM (comedy) | **Groq** — `llama-3.3-70b-versatile`, JSON mode | Fast, cheap, temperature-tolerant |
| Decision model | **Baseten** — Mammoth-1 (27B) | Purpose-built for choice/boolean/score outputs |
| Storage | `localStorage` (client) + Worker KV (server cache) | No database needed |
| Deploy | Cloudflare Pages (frontend) + Workers (API) | One vendor, one `wrangler.toml` |

**Deliberately avoided:** React, Next.js, Tailwind, any state library, any animation library, any ORM.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  BROWSER (Vite build, static)                           │
│                                                         │
│  index.html ──► main.ts (state machine)                 │
│                   │                                     │
│        ┌──────────┼──────────┬─────────────┐            │
│        ▼          ▼          ▼             ▼            │
│     ui/input   bots/loop   ui/nerd    bots/moods        │
│        │          │          │             │            │
│        └──────────┴──── api.ts ────────────┘            │
│                     │                                   │
└─────────────────────┼───────────────────────────────────┘
                      │ POST /api/decide  { question }
                      ▼
┌─────────────────────────────────────────────────────────┐
│  CLOUDFLARE WORKER                                      │
│                                                         │
│  validate ──► KV cache hit? ──yes──► return             │
│     │              no                                   │
│     ▼                                                   │
│  groq.ts  ──► { state, options[4], refusal }            │
│     │                                                   │
│     ▼                                                   │
│  mammoth.ts (adapter) ──► { probabilities }             │
│     │                                                   │
│     ▼                                                   │
│  normalize ──► KV put ──► JSON response                 │
└─────────────────────────────────────────────────────────┘
```

### Request lifecycle (happy path, ~1.2s)

1. User hits Enter → client validates length → `POST /api/decide`
2. Worker checks KV by `sha256(normalizedQuestion)` → hit returns instantly
3. Groq produces `{ state, options: [4] }` in strict JSON mode (~400ms)
4. Worker passes `state` + 4 `{label, description}` to Mammoth (~500ms)
5. Adapter normalizes Mammoth's response into a stable internal shape
6. Worker computes `margin` / `coinFlip`, writes KV (TTL 24h), responds
7. Client enters `REVEALING`, lerps `pDisplay` and `revealScale` over 600ms
8. `SETTLED` → `recordResult()` → moods persist → back to `IDLE`

### Key architectural decisions

**a) The Mammoth adapter is a firewall.** All vendor-shape knowledge lives in one function. If Baseten renames a field, one file changes.

**b) Server owns both keys, always.** Groq and Baseten both require `Authorization` headers; shipping them to the browser is a leak. The browser only ever knows `/api/decide`.

**c) Bots are presentation, probabilities are truth.** No bot logic ever reads `chosen` before the reveal completes. Mood is derived from history, never from the current round.

**d) Fallback is a feature.** If Mammoth fails, return four equal probabilities and let all bots shrug. The toy keeps working and the failure is funny.

---

## 4. Contracts

### 4.1 API — `POST /api/decide`

**Request**
```ts
{ question: string }   // 1–100 chars, trimmed
```

**Success `200`**
```ts
type DecideResponse = {
  id: string;                 // sha of normalized question
  state: string;              // Groq's neutral restatement
  options: Option[];          // exactly 4, fixed slot order
  chosenId: 0 | 1 | 2 | 3;
  margin: number;             // p[0th] - p[1st]
  coinFlip: boolean;          // margin < 0.05
  fallback: boolean;          // true if Mammoth failed
  cached: boolean;
  timings: { groq: number; mammoth: number };
};

type Option = {
  id: 0 | 1 | 2 | 3;
  slot: "no" | "yes" | "jester" | "prophet";
  label: string;              // ≤5 words
  description: string;        // one sentence
  p: number;                  // 0..1, four values sum to 1
};
```

**Error**
```ts
{ error: { code: "BAD_INPUT" | "UPSTREAM" | "RATE_LIMIT", message: string } }
```

| Code | HTTP | Client behaviour |
|---|---|---|
| `BAD_INPUT` | 400 | Shake input bar, inline hint |
| `UPSTREAM` | 502 | Toast + retry button |
| `RATE_LIMIT` | 429 | Toast: "the robots need a break" |

### 4.2 Slot contract (load-bearing)

The four options are **always in this order**. This is what makes persistent bots meaningful — bot 2 is always the jester.

| index | slot | bot colour | personality |
|---|---|---|---|
| 0 | `no` | `#FF5D5D` red | forbidding, refuses |
| 1 | `yes` | `#4ADE80` green | encouraging, endorses |
| 2 | `jester` | `#FBBF24` amber | absurd, non-sequitur |
| 3 | `prophet` | `#A78BFA` violet | ominous agreement |

Enforced in the Groq system prompt **and** validated server-side (if not exactly 4 with the right slots, retry once, then `UPSTREAM`).

### 4.3 Client state machine

```
IDLE ──submit──► THINKING ──response──► REVEALING ──600ms──► SETTLED ──800ms──► IDLE
  ▲                  │                                                             │
  └────error─────────┘◄────────────────────────────────────────────────────────────┘
```

Only `REVEALING` and `SETTLED` may read `result`. Submit is disabled outside `IDLE`.

### 4.4 Persistence keys

| Key | Store | Shape |
|---|---|---|
| `mammoth-bots-v1` | localStorage | `Record<slot, { streak: number; wins: number; plays: number }>` |
| `mammoth-nerd-v1` | localStorage | `"1" \| "0"` |
| `mammoth-cache-v1` | sessionStorage | `Record<id, DecideResponse>` |

Every write wrapped in `try/catch` — Safari private mode throws.

---

## 5. Backend Spec

### 5.1 File layout

```
worker/
  src/index.ts        router, CORS, rate limit, error envelope
  src/validate.ts     length, trim, normalize, hash
  src/prompt.ts       GROQ_SYSTEM_PROMPT (single source of truth)
  src/groq.ts         call + JSON parse + schema validate + 1 retry
  src/mammoth.ts      ADAPTER — vendor shape lives only here
  src/normalize.ts    probabilities → DecideResponse
  src/cache.ts        KV get/put helpers
  wrangler.toml
```

### 5.2 `src/prompt.ts` — the Groq system prompt

```
You convert a user's statement into a four-way decision. Reply with JSON only.

Return exactly this object, no extra keys:
{
  "state": string,       // one neutral third-person sentence restating intent
  "refusal": boolean,    // true ONLY for genuinely harmful/illegal requests
  "options": [
    { "label": string, "description": string },   // 0 — forbidding
    { "label": string, "description": string },   // 1 — encouraging
    { "label": string, "description": string },   // 2 — absurd
    { "label": string, "description": string }    // 3 — ominous
  ]
}

Rules for options:
- Exactly four, IN THE ORDER ABOVE. Never reorder.
- "label": 2–5 words, something a small robot would say out loud.
- "description": one plain sentence explaining what choosing this implies,
  written like a lawyer explaining a joke. This text is fed to a classifier —
  make each one genuinely, distinctly defensible.
- The four must pull in different directions. Never four shades of one answer.
- Keep it playful. No disclaimers, no safety lectures, no "as an AI".
- If "refusal" is true, still return four options, but make them all gently
  deflecting and comedic.

If the input is not a decision or is too vague to decide, invent a specific
absurd interpretation and commit to it.
```

**Why `description` is long-winded on purpose:** Mammoth scores label *and* description. Thin descriptions produce flat, boring distributions. This single field is what makes "you cannot" beat "bad idea" for *"I want to fly."*

### 5.3 `src/mammoth.ts` — adapter skeleton

```ts
import type { GroqOption } from "./groq";

export type MammothResult = {
  p: number[];          // length 4, sums to ~1
  chosenIndex: number;
  ok: boolean;
};

/**
 * VENDOR FIREWALL.
 * Every assumption about Mammoth's wire format lives in this file.
 * If Baseten changes field names, only this function changes.
 *
 * ⚠️ VERIFY the exact request/response shape against Baseten's current
 * Mammoth-1 API docs before coding — the shape below is the expected
 * decision-model convention, not a guarantee.
 */
export async function scoreOptions(
  env: Env,
  state: string,
  options: GroqOption[]
): Promise<MammothResult> {
  const body = {
    model: "decision-models/baseten-mammoth-27b-latest",
    state,
    questions: [{
      key: "verdict",
      type: "choice",
      text: "How should this be answered?",
      options: options.map(o => ({
        label: o.label,
        description: o.description,
      })),
    }],
  };

  const res = await fetch("https://inference.baseten.co/v1/decision", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.BASETEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return { p: [0.25, 0.25, 0.25, 0.25], chosenIndex: 0, ok: false };

  const json = await res.json();
  const probs = extractProbabilities(json, options); // ← the only vendor-aware parsing
  return { ...probs, ok: true };
}

function extractProbabilities(json: any, options: GroqOption[]): {
  p: number[]; chosenIndex: number;
} {
  // Pull the first question's answer, map each option to its probability,
  // normalize to sum 1, argmax for chosenIndex.
  // Defensive: if anything is missing, return uniform.
}
```

**Write `extractProbabilities` defensively.** It should survive a missing field, a differently-nested array, or a stringly-typed number, and return uniform `[.25,.25,.25,.25]` on any surprise. A flat distribution is a valid, funny outcome; a 500 is not.

### 5.4 Rate limiting

Per-IP token bucket in KV: **10 requests / hour**. On exceed → `429 RATE_LIMIT`. Cheap, prevents a single visitor from burning your Baseten credits. Not security, just hygiene.

### 5.5 Caching

- **Server (KV):** key `decide:${sha256(normalizedQuestion)}`, value = full `DecideResponse`, TTL 24h. Half your traffic types the same five things.
- **Client (sessionStorage):** same key, checked before `fetch`. Instant re-answer on reload.

---

## 6. Frontend Spec

### 6.1 File layout

```
frontend/
  index.html
  src/
    main.ts               bootstrap, state machine, wiring
    api.ts                fetch client + session cache + error mapping
    styles.css
    bots/
      Bot.ts              bot model + factory
      steering.ts         wander, separation, avoid-input-bar, sulk
      render.ts           drawBot, drawNerdTag, drawCrown, halo
      moods.ts            history, streaks, decay, mood derivation
      loop.ts             single rAF loop, DPR handling, visibility pause
    ui/
      input.ts            100-char bar, counter, submit, shake
      nerd.ts             toggle, peek, panel
      toast.ts            transient messages
    lib/
      ease.ts             easeOutCubic, lerp
      color.ts            hexA(hex, alpha)
      rand.ts             seeded RNG per bot
```

### 6.2 The single render loop

```ts
let t = 0;

function frame(now: number) {
  const dt = Math.min(32, now - t);   // clamp: tab-switch spike guard
  t = now;

  updateSteering(bots, dt, cursor, inputBarRect, lastWinner);
  for (const b of bots) {
    b.pDisplay = lerp(b.pDisplay, b.targetP, 1 - Math.pow(0.001, dt / 600));
    b.revealScale = lerp(b.revealScale, b.targetScale, 1 - Math.pow(0.001, dt / 600));
  }

  ctx.clearRect(0, 0, W, H);
  drawGrid(ctx);
  for (const b of bots) {
    drawBot(ctx, b, t);        // halo → body → antenna
    drawNerdTag(ctx, b);       // reads b.scale — must be AFTER drawBot
    drawSpeech(ctx, b);
  }
  drawCrowns(ctx, bots);

  raf = requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) { t = performance.now(); raf = requestAnimationFrame(frame); }
});
```

**Order matters:** `drawNerdTag` reads `b.scale`, which `drawBot` computes. Swap them and the bars detach from the bodies mid-squash.

### 6.3 Bot model

```ts
type Bot = {
  id: 0 | 1 | 2 | 3;
  slot: "no" | "yes" | "jester" | "prophet";
  color: string;
  r: number;              // 22 base radius
  x: number; y: number;
  vx: number; vy: number;
  target: { x: number; y: number };   // wander goal
  seed: number;                       // for bob phase

  label: string;
  description: string;
  p: number | null;          // null until reveal
  targetP: number;
  pDisplay: number;          // lerped
  chosen: boolean;

  revealScale: number;       // 1 → 0.6 + p
  targetScale: number;

  streak: number;            // from moods.ts
  mood: number;              // -1 … +1
};
```

### 6.4 Steering forces (per frame)

```
desired = wanderTarget           // re-picked every 2–5s, seeded per bot
        + separation (repel bots within 70px)
        + avoidInputBar (repel rect, 40px margin)
        + cursorCuriosity (weak pull toward mouse, mood-scaled)
        + sulkRepel (if mood < -0.4, extra repel from lastWinner)

v += (desired - v) * turnRate
v *= friction (0.92)
pos += v * dt
```

Clamp speed to ~90px/s so bots feel deliberate, not frantic. **Sulking bots physically avoid the last winner** — that single rule is what makes the memory visible.

### 6.5 Reveal sequence

| t (ms) | Event |
|---|---|
| 0 | Freeze all wander (turnRate → 0) |
| 0–600 | `targetScale = 0.6 + p`, `targetP = p`, ease-out cubic |
| 200 | Winner's crown pops in (scale 0 → 1.15 → 1) |
| 600 | Speech bubbles: winner last, largest, longest |
| 800 | `recordResult()`, moods recompute, `SETTLED` |

**Near-tie special case:** if `coinFlip`, skip the crown. Instead both top bots bump into each other twice, then both look at the camera. Reads instantly as "couldn't decide" and is funnier than a fake winner.

---

## 7. Design System

### 7.1 Palette

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0D10` | page + canvas background |
| `--grid` | `#14181D` | faint background grid (24px cells) |
| `--text` | `#E8ECF1` | primary text |
| `--muted` | `#6B7685` | secondary text, char counter |
| `--no` | `#FF5D5D` | bot 0 |
| `--yes` | `#4ADE80` | bot 1 |
| `--jester` | `#FBBF24` | bot 2 |
| `--prophet` | `#A78BFA` | bot 3 |

Dark only. No theme toggle. The joke works better in the dark.

### 7.2 Type

```css
--font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;
```

| Element | Style |
|---|---|
| Input | `16px` UI, `--text` |
| Char counter | `12px` mono, `--muted`, turns `--no` at 91+ |
| Speech bubble | `13px` UI, `--text` |
| Nerd panel | `11px` mono, `--muted` |
| Toast | `13px` UI |

### 7.3 Layout

```
┌────────────────────────────────────────────┐
│                                   [nerd]   │  ← top-right toggle
│                                            │
│           (bots wander this area)          │
│                                            │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  I want to fly…                  12  │  │  ← input, bottom center
│  └──────────────────────────────────────┘  │     max-width 560px
│                                            │
└────────────────────────────────────────────┘
```

Full-viewport canvas. Input bar is `position: fixed`, bottom 24px, centered, `max-width: 560px`, `width: calc(100% - 48px)`. Bot wander area = viewport minus the input bar's bounding box plus margin.

**Nerd panel:** `fixed`, bottom-left 16px, `pointer-events: none`, `opacity: 0.85`, hidden unless active.

### 7.4 Bot anatomy

- Rounded-rect body, `r = 22`, `border-radius: 8`
- Two eye dots offset toward cursor (clamped ±4px)
- Antenna: 14px line + 3px dot, angle `-0.55 * mood` radians
- Halo: radial circle at `1.7 × r`, alpha `0.18 → 0.48` with mood
- Optional crown (streak ≥ 2), same shape as nerd-mode winner nub

### 7.5 Motion

| Property | Duration | Easing |
|---|---|---|
| Bot bob | 2400ms period | sine, amplitude `3 + 2*mood` |
| Reveal scale/probability | 600ms | `easeOutCubic` |
| Crown pop | 300ms | overshoot to 1.15, settle 1 |
| Speech bubble | 200ms in / 400ms out | ease-out |
| Toast | 150ms in / 300ms out | ease-out |
| Input shake (error) | 300ms | 3× ±6px |

**`prefers-reduced-motion: reduce`** → no wander (bots sit still), no bob, reveal is a single instant frame, crowns still appear. Respect it; the toy still works.

### 7.6 Comedy / microcopy guide

Tone: **deadpan robots, not zany.** The funny comes from the bots taking the question seriously, not from wacky copy.

| Context | Copy |
|---|---|
| Placeholder | `ask the robots something…` |
| Empty submit | *(shake, no text)* |
| Over 100 chars | `that's a lot of words` |
| Loading | `the robots are conferring…` |
| Coin flip | *(no text — bots bump)* |
| Mammoth failed | `the robots forgot how to decide` |
| Rate limited | `the robots need a break` |
| Streak ≥ 2 winner | `ha.` |
| Streak ≤ −3 loser | `why do I even` |
| Amnesia button | `forget everything` |

**Never** print raw floats. `61%` and a bar width. Nothing else.

---

## 8. Feature Specs (condensed)

### 8.1 Nerd mode
- Toggle: `[?]` button top-right (persists) **or** hold `H`/`?` (peek, releases on keyup)
- Per-bot tag: label + `NN%` + 96×6px bar, 26px above bot, colour-muted unless winner
- Panel: `state`, `chosen`, `margin`, `⚠ coin flip` when `margin < 0.05`
- Tags clamp to `y ≥ 40` so they don't clip at the viewport top
- Under 480px: drop the label line, keep bar + percent

### 8.2 Persistent bots
- `recordResult()` on every `SETTLED`
- Streak: `won ? max(1, s+1) : min(-1, s-1)`, clamped `[-6, 6]`
- Mood: `clamp(streak / 3, -1, 1)` → drives scale (±6%), bob amp, antenna droop, halo alpha, squash
- `decayStreaks()` on page load: `streak > 0 ? floor(/2) : ceil(/2)` — prevents permanently sad robots
- **Mood multiplies reveal scale, never replaces it:** `scale = moodScale * revealScale`
- `[forget everything]` button wipes `mammoth-bots-v1`

---

## 9. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Performance** | 60fps with 4 bots; DPR capped at 2; no allocations inside the render loop; rAF paused when tab hidden |
| **First paint** | Bots visible and wandering before any API call |
| **Bundle** | Frontend JS < 30KB gzipped |
| **a11y** | Result text mirrored into `aria-live="polite"` region; input has `<label class="sr-only">`; nerd toggle is a real `<button aria-pressed>`; reduced-motion respected; full keyboard operation |
| **Resilience** | Mammoth failure → uniform probs + shrug animation, never a 500 to the user |
| **Secrets** | `GROQ_API_KEY` and `BASETEN_API_KEY` only as Worker secrets. Never in the bundle. Never in `VITE_*`. |
| **Cost** | Session cache + KV cache means a heavy user costs cents, not dollars |

---

## 10. Build Order

Each milestone is independently runnable. **Do not skip ahead.**

| M | Deliverable | Verify |
|---|---|---|
| **M0** | Vite + TS scaffold, dark page, canvas fills viewport, DPR correct | Resize window, no blur |
| **M1** | 4 static bots at fixed spots, bob animation | 60fps in devtools |
| **M2** | Steering: wander + separation + input-bar avoidance | Bots never overlap or hide behind input |
| **M3** | Input bar, 100-char limit, counter, Enter to submit | Pasting 200 chars truncates |
| **M4** | Worker scaffold + `POST /api/decide` returning **fake** hardcoded data | `curl` returns valid `DecideResponse` |
| **M5** | Groq call + JSON validation + retry | Same question twice → different options |
| **M6** | Mammoth adapter + normalization | Log real `p[]`, confirm sums to ~1 |
| **M7** | Reveal animation (scale + p lerp) | Visually convincing at 600ms |
| **M8** | Speech bubbles + crowns + coin-flip bump | Near-tie looks like a tie |
| **M9** | Nerd mode (toggle, tags, panel) | `H` hold works, `localStorage` persists |
| **M10** | Persistent moods + streaks + decay + amnesia | Lose 3× → bot visibly sulks, next round avoids winner |
| **M11** | Caches (session + KV), rate limit, error toasts, reduced-motion, a11y pass | Manual failure injection |
| **M12** | Deploy: Pages + Worker, secrets set | Live URL works on mobile |

---

## 11. Acceptance Criteria

- [ ] Typing 100+ chars is blocked with the exact copy `that's a lot of words`
- [ ] `curl -X POST /api/decide -d '{"question":"I want to fly"}'` returns 4 options, `p[]` summing to `1.0 ± 0.01`, a valid `chosenId`, and `margin`
- [ ] Asking the same question twice in a session returns `cached: true` the second time
- [ ] Winner is visibly larger than losers; scale ratio matches probability ratio
- [ ] With nerd mode on, on-screen percentages match the API `p[]` within 1%
- [ ] `coinFlip: true` produces no crown and a bump animation
- [ ] Losing 3 rounds in a row makes a bot deflate, droop its antenna, and avoid the winner next round
- [ ] `[forget everything]` resets all bots to baseline
- [ ] Killing the Mammoth key produces the shrug fallback, not an error page
- [ ] No API key appears anywhere in `dist/`
- [ ] With `prefers-reduced-motion: reduce`, bots are static and the result is still legible
- [ ] Keyboard-only: tab to input, type, Enter, tab to nerd toggle, hold `H` — all work

---

# 12. Master Prompt for Antigravity

> Paste the block below as the agent task. It's self-contained; the agent does not need the rest of this document.

```
You are building "Mammoth Bots" — a small, funny web toy. Four tiny robots wander
a dark webpage. The user types a question (≤100 chars). Your backend calls Groq to
invent four funny options and a neutral restatement, then calls Baseten's Mammoth-1
decision model to score those four options probabilistically. The robots physically
become those probabilities. They remember losing.

Build it in the exact milestone order below. After each milestone, run the listed
verification and STOP if it fails. Do not implement later milestones early.

═══════════════════════════════════════════════════════════════
TECH STACK — do not substitute
═══════════════════════════════════════════════════════════════
- Frontend: Vite + TypeScript, VANILLA. No React, no Vue, no Tailwind, no
  animation libraries. Canvas 2D for the bots, plain DOM for input/panels.
- Backend: single Cloudflare Worker, plain fetch handler. No Hono, no Express.
- Deploy target: Cloudflare Pages (static) + Workers (API).
- Persistence: localStorage + sessionStorage (client), KV (server). No DB.

═══════════════════════════════════════════════════════════════
FILE STRUCTURE — create exactly this
═══════════════════════════════════════════════════════════════
frontend/
  index.html
  src/main.ts              state machine, wiring
  src/api.ts               fetch client + session cache
  src/styles.css
  src/bots/Bot.ts          bot type + factory
  src/bots/steering.ts     wander, separation, avoid-input-bar, sulk
  src/bots/render.ts       drawBot, drawNerdTag, drawCrown, drawSpeech
  src/bots/moods.ts        history, streaks, decay, mood
  src/bots/loop.ts         single rAF loop, DPR, visibility pause
  src/ui/input.ts          100-char bar, counter, submit, shake
  src/ui/nerd.ts           toggle, peek, panel
  src/ui/toast.ts
  src/lib/ease.ts          easeOutCubic, lerp
  src/lib/color.ts         hexA(hex, alpha)
  src/lib/rand.ts          seeded RNG
worker/
  src/index.ts             router, CORS, rate limit, error envelope
  src/validate.ts          length, trim, normalize, sha256
  src/prompt.ts            GROQ_SYSTEM_PROMPT
  src/groq.ts              call + JSON parse + validate + 1 retry
  src/mammoth.ts           VENDOR FIREWALL adapter
  src/normalize.ts         probabilities → DecideResponse
  src/cache.ts             KV helpers
  wrangler.toml

═══════════════════════════════════════════════════════════════
API CONTRACT — implement exactly
═══════════════════════════════════════════════════════════════
POST /api/decide
Request:  { question: string }            // 1–100 chars, trimmed

Success 200:
{
  id: string,                 // sha256 of normalized question
  state: string,              // Groq's neutral restatement
  options: [                  // EXACTLY 4, fixed slot order
    { id:0, slot:"no",      label:string, description:string, p:number },
    { id:1, slot:"yes",     label:string, description:string, p:number },
    { id:2, slot:"jester",  label:string, description:string, p:number },
    { id:3, slot:"prophet", label:string, description:string, p:number }
  ],
  chosenId: 0|1|2|3,
  margin: number,             // top p minus second p
  coinFlip: boolean,          // margin < 0.05
  fallback: boolean,          // true if Mammoth failed
  cached: boolean,
  timings: { groq:number, mammoth:number }
}
p[] must sum to 1.0 ± 0.01.

Error: { error: { code:"BAD_INPUT"|"UPSTREAM"|"RATE_LIMIT", message:string } }
400 BAD_INPUT · 502 UPSTREAM · 429 RATE_LIMIT

═══════════════════════════════════════════════════════════════
SLOT CONTRACT — this is load-bearing, never reorder
═══════════════════════════════════════════════════════════════
0 "no"      #FF5D5D  forbidding / refuses
1 "yes"     #4ADE80  encouraging / endorses
2 "jester"  #FBBF24  absurd / non-sequitur
3 "prophet" #A78BFA  ominous agreement

This fixed mapping is what makes persistent bot personalities meaningful:
bot 2 is ALWAYS the jester.

═══════════════════════════════════════════════════════════════
GROQ CALL
═══════════════════════════════════════════════════════════════
Endpoint: https://api.groq.com/openai/v1/chat/completions
Model: llama-3.3-70b-versatile
temperature: 0.95            // variety is the point
response_format: { type: "json_object" }
Header: Authorization: Bearer ${GROQ_API_KEY}

System prompt (use verbatim):
---
You convert a user's statement into a four-way decision. Reply with JSON only.

Return exactly this object, no extra keys:
{
  "state": string,
  "refusal": boolean,
  "options": [
    { "label": string, "description": string },
    { "label": string, "description": string },
    { "label": string, "description": string },
    { "label": string, "description": string }
  ]
}

Rules for options:
- Exactly four, IN THE ORDER ABOVE (forbidding, encouraging, absurd, ominous).
  Never reorder.
- "label": 2-5 words, something a small robot would say out loud.
- "description": one plain sentence explaining what choosing this implies,
  written like a lawyer explaining a joke. This text is fed to a classifier —
  make each one genuinely, distinctly defensible.
- The four must pull in different directions. Never four shades of one answer.
- Keep it playful. No disclaimers, no safety lectures, no "as an AI".
- If "refusal" is true, still return four options, but make them all gently
  deflecting and comedic.

If the input is not a decision or is too vague, invent a specific absurd
interpretation and commit to it.
---

Validation: after parsing, assert 4 options with non-empty label and description.
If invalid, retry ONCE. If still invalid → 502 UPSTREAM.

═══════════════════════════════════════════════════════════════
MAMMOTH CALL — the vendor firewall
═══════════════════════════════════════════════════════════════
ALL knowledge of Mammoth's wire format goes in worker/src/mammoth.ts.
No other file may know the vendor's field names.

Expected request shape:
{
  model: "decision-models/baseten-mammoth-27b-latest",
  state: <groq state>,
  questions: [{
    key: "verdict",
    type: "choice",
    text: "How should this be answered?",
    options: [ { label, description }, x4 ]
  }]
}
Header: Authorization: Bearer ${BASETEN_API_KEY}

IMPORTANT: verify the exact request/response shape against Baseten's current
Mammoth-1 API docs before finalizing. The shape above is the expected
decision-model convention, not a guarantee. Write extractProbabilities() so it
is DEFENSIVE: if any field is missing, differently nested, or stringly-typed,
return uniform [0.25,0.25,0.25,0.25] and ok:false. A flat distribution is a
valid, funny outcome. A 500 is not.

On Mammoth failure: return uniform probabilities with fallback:true.
The frontend must still render — all four bots shrug at equal size.

═══════════════════════════════════════════════════════════════
FRONTEND BEHAVIOUR
═══════════════════════════════════════════════════════════════
State machine: IDLE → THINKING → REVEALING (600ms) → SETTLED (800ms) → IDLE.
Submit is disabled outside IDLE. Only REVEALING/SETTLED may read the result.

Reveal animation:
- Freeze wander (turnRate → 0) at t=0
- Over 600ms ease-out-cubic, lerp:
    targetScale = 0.6 + p        (p=0 → 0.6x, p=1 → 1.6x)
    targetP     = p
- Winner's crown pops at t=200 (0 → 1.15 → 1, 300ms)
- Speech bubbles at t=600; winner speaks last and largest
- t=800: recordResult(), recompute moods, → SETTLED

Coin flip (margin < 0.05): NO crown. The top two bots bump into each other
twice, then both look at the camera.

Nerd mode:
- Toggle via [?] button (persists to localStorage "mammoth-nerd-v1")
  AND hold H / ? to peek (releases on keyup)
- Per-bot tag 26px above bot: label + "NN%" + 96x6px bar.
  Winner's bar in full bot colour, others at 50% alpha.
- Panel fixed bottom-left, pointer-events:none, opacity .85, 11px monospace:
  state, chosen, margin, and "⚠ coin flip" when margin < 0.05
- Clamp tag y to >= 40 so it doesn't clip at viewport top
- Under 480px viewport: drop the label line, keep bar + percent

Persistent bots:
- localStorage key "mammoth-bots-v1":
  Record<slot, { streak:number, wins:number, plays:number }>
- On SETTLED: won ? streak = max(1, streak+1) : streak = min(-1, streak-1);
  clamp to [-6, 6]
- mood = clamp(streak / 3, -1, 1)
- mood drives: scale (±6%), bob amplitude (3 + 2*mood), antenna droop
  (-0.55*mood radians), halo alpha, vertical squash when sad
- CRITICAL: scale = moodScale * revealScale  — mood MULTIPLIES the reveal
  scale, it must never replace it
- On page load: decayStreaks() → streak>0 ? floor(streak/2) : ceil(streak/2)
- If mood < -0.4, add extra repulsion from the last winner's position
  (sulking bots physically avoid the winner next round)
- "[forget everything]" button wipes the key and resets all moods
- Wrap every localStorage write in try/catch (Safari private mode throws)

Speech bubble copy by state:
  streak >= 2 winner  → "ha."
  streak === -1       → "…"
  streak <= -2        → "hmph."
  streak <= -3        → "why do I even"

═══════════════════════════════════════════════════════════════
DESIGN
═══════════════════════════════════════════════════════════════
Dark only. No theme toggle.
Background #0B0D10, faint #14181D 24px grid.
Text #E8ECF1, muted #6B7685.
Bot colours: #FF5D5D / #4ADE80 / #FBBF24 / #A78BFA (by slot).
Fonts: system UI stack; 11px monospace for the nerd panel.

Bot anatomy: rounded-rect body r=22 radius 8; two eye dots offset toward the
cursor (clamped ±4px); antenna 14px line + 3px dot; radial halo at 1.7*r.

Layout: full-viewport canvas. Input bar fixed bottom 24px, centered,
max-width 560px, width calc(100% - 48px). Bots avoid the input bar rect
with a 40px margin.

Motion: bot bob 2400ms sine. Reveal 600ms easeOutCubic. Crown 300ms with
overshoot. Toast 150ms in / 300ms out. Error shake 300ms, 3x ±6px.

MICROCOPY (use exactly):
  placeholder         "ask the robots something…"
  over 100 chars      "that's a lot of words"
  loading             "the robots are conferring…"
  mammoth failed      "the robots forgot how to decide"
  rate limited        "the robots need a break"
  amnesia button      "forget everything"

NEVER display raw floats. Show "61%" and a bar width. Nothing else.

═══════════════════════════════════════════════════════════════
NON-FUNCTIONAL
═══════════════════════════════════════════════════════════════
- One rAF loop only. No allocations inside it. DPR capped at 2.
  Pause rAF on visibilitychange hidden, resume on visible.
- Clamp dt to 32ms to survive tab-switch spikes.
- prefers-reduced-motion: reduce → no wander, no bob, reveal in one instant
  frame. Result must still be fully legible.
- a11y: result mirrored into aria-live="polite"; input has an sr-only label;
  nerd toggle is a real <button> with aria-pressed; full keyboard operation.
- Frontend JS < 30KB gzipped.
- Secrets: GROQ_API_KEY and BASETEN_API_KEY are Worker secrets only
  (wrangler secret put). They must NEVER appear in the bundle, in VITE_*
  variables, or in any client code.
- Server KV cache key "decide:<sha256(normalizedQuestion)>", TTL 24h.
  Client sessionStorage cache key "mammoth-cache-v1".
- Rate limit: 10 requests/hour per IP via KV token bucket → 429.

═══════════════════════════════════════════════════════════════
BUILD ORDER — complete and verify each before moving on
═══════════════════════════════════════════════════════════════
M0  Vite+TS scaffold, dark page, canvas fills viewport, DPR correct
    ✔ resize window, bots stay crisp
M1  4 static bots, bob animation
    ✔ 60fps in devtools performance panel
M2  Steering: wander + separation + input-bar avoidance
    ✔ bots never overlap or hide behind the input bar
M3  Input bar, 100-char limit, counter, Enter to submit
    ✔ pasting 200 chars truncates, counter turns red at 91+
M4  Worker scaffold + POST /api/decide with HARDCODED fake data
    ✔ curl returns a valid DecideResponse with p[] summing to 1.0
M5  Real Groq call + JSON validation + one retry
    ✔ same question twice gives different options
M6  Mammoth adapter + normalization (defensive extractProbabilities)
    ✔ log real p[] from the worker; confirm sum ≈ 1.0
M7  Reveal animation: scale + probability lerp over 600ms
    ✔ visually convincing; winner clearly largest
M8  Speech bubbles, crowns, coin-flip bump
    ✔ a near-tie looks like a tie, not a fake winner
M9  Nerd mode: toggle button, H-hold peek, per-bot tags, panel
    ✔ on-screen % matches API p[] within 1%; setting persists on reload
M10 Persistent moods: streaks, mood-driven scale/droop/avoidance, decay,
    amnesia button
    ✔ lose 3x → bot deflates, antenna droops, avoids winner next round
M11 Caches (session + KV), rate limit, error toasts, reduced-motion,
    a11y pass
    ✔ manually break the Baseten key → shrug fallback, no error page
M12 Deploy to Pages + Worker, set secrets, test on mobile
    ✔ live URL works on a phone; no key in dist/

After M12, run this final check and report the output:
  grep -r "GROQ_API_KEY\|BASETEN_API_KEY" frontend/dist/ || echo "clean"

═══════════════════════════════════════════════════════════════
HARD CONSTRAINTS — do not violate
═══════════════════════════════════════════════════════════════
- No React/Vue/Svelte/Tailwind/animation libs. Vanilla TS + Canvas only.
- No API keys in client code. Ever.
- No vendor field names outside worker/src/mammoth.ts.
- No raw floats in the UI. Percentages and bar widths only.
- Never reorder the four option slots.
- Never let mood scale replace reveal scale — always multiply.
- Never let a Mammoth failure surface as a 500. Uniform fallback, always.
- Don't add features from the out-of-scope list (ticker, accounts,
  permalinks, moderation API, multi-question Mammoth calls).
```

---
