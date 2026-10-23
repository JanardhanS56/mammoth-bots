remote-repo: https://github.com/JanardhanS56/mammoth-bots.git

# DEVELOPMENT LOGBOOK: MAJOR DECISIONS, FEATURES & ARCHITECTURE

## M0: Vite + TypeScript Scaffold & Canvas Setup
- **Architecture & Tooling**: Configured npm monorepo workspaces (`frontend`, `worker`) with strict TypeScript configuration and Vitest for headless unit tests.
- **DPR & Canvas Sizing**: Implemented dynamic devicePixelRatio calculation capped at 2.0 to ensure crisp rendering on Retina displays without unbounded pixel fill overhead.
- **Single rAF Loop & Tab Lifecycle**: Integrated `visibilitychange` listeners to pause requestAnimationFrame when the tab is hidden, preventing CPU usage and accumulator drift; clamped delta-time (`dt`) to 32ms.
- **Design Tokens**: Defined the strict dark palette (`#0B0D10` background, `#14181D` 24px grid, `#E8ECF1` text, `#6B7685` muted) and the 4 fixed slot colors: `#FF5D5D` (no), `#4ADE80` (yes), `#FBBF24` (jester), `#A78BFA` (prophet).
- **Math & Color Utilities**: Created `easeOutCubic`, `lerp`, `hexA` RGBA converter, and Mulberry32 seeded pseudo-random number generator (`rand.ts`).

## M1: Bot Model & Canvas Rendering
- **Bot Anatomy**: Built `drawBot()` rendering 22px radius rounded-rect bodies with 8px corner radii, dual eye dots tracking cursor position (clamped to ±4px), 14px antenna with 3px tip dot drooping according to mood (`-0.55 * mood` radians), and a 1.7× radial halo gradient.
- **Motion & Bobbing**: Implemented 2400ms periodic sine wave bobbing with amplitude scaling (`3 + 2 * mood`), staggered using bot phase seeds (`id * 1.57`).
- **Sad Squash & Mood Scaling**: Multiplied reveal scale by mood scale (`1 + 0.06 * mood`) and added sad squash/bulge mechanics.
- **Accessibility & Reduced Motion**: Honored `prefers-reduced-motion: reduce`, eliminating bobbing and wander forces when requested.

## M2: Steering Dynamics & Input Bar Avoidance
- **Force Synthesis**: Implemented 5-layer steering force model:
  1. Wander target selection re-seeded every 2–5 seconds within safe boundaries.
  2. Separation force repelling nearby bots within 70px.
  3. Input bar avoidance bounding box with 40px safety margin pushing bots upward and laterally.
  4. Viewport edge repulsion keeping bots inside visible canvas.
  5. Cursor curiosity and loser sulking repulsion (`mood < -0.4`).
- **Velocity Integration**: Smooth turn rate (`0.08`), friction damping (`0.92`), and deliberate speed capping at 90px/s.

## M3: 100-Char Input Bar & Interactive Microcopy
- **Validation & Limits**: Enforced 100-character ceiling on input and clipboard paste events. Pasting strings over 100 characters truncates to 100 and shows exact microcopy `"that's a lot of words"`.
- **Character Counter**: Monospace character count turning red (`#FF5D5D`) at 91+ characters.
- **State Machine Safeguards**: Enter and submit triggers are disabled unless client state is `IDLE`. Empty submissions trigger 300ms CSS shake without error text.

## M4: Worker Scaffold & Contract-Compliant Decide Endpoint
- **Cloudflare Worker Setup**: Created zero-dependency plain fetch handler with strict TypeScript configuration and Wrangler bindings.
- **CORS & Error Envelope**: Configured preflight OPTIONS and standardized error envelope (`BAD_INPUT`, `UPSTREAM`, `RATE_LIMIT`).
- **Validation & Hashing**: Sanitized input strings (trimming, collapse inner whitespace, lowercase) and computed deterministic SHA-256 hash using Web Crypto `crypto.subtle`.
- **Response Normalization**: Created `buildDecideResponse()` ensuring exactly 4 fixed slots (`no`, `yes`, `jester`, `prophet`), exact probability summation to 1.0000, argmax winner identification, margin calculation, and `coinFlip` flag (< 0.05). Verified with automated tests.

## M5: Groq Integration & Schema Validation with Single Retry
- **Prompt Standardization**: Embedded verbatim `GROQ_SYSTEM_PROMPT` in `prompt.ts`, instructing model `llama-3.3-70b-versatile` with temperature 0.95 and JSON object response format.
- **Defensive Parsing & Validation**: Enforced strict validation on Groq response ensuring exactly 4 ordered options, non-empty labels (2-5 words), and legalistic comedic descriptions.
- **Fail-Safe Retry**: Implemented automatic single retry on network failure or schema violation; on repeated failure, cleanly returns 502 `UPSTREAM` with error envelope.

## M6: Mammoth Vendor Firewall & Defensive Probability Adapter
- **Strict Isolation**: Confined all knowledge of Baseten/Mammoth request and response wire formats to `worker/src/mammoth.ts`.
- **Defensive Multi-Format Extractor**: Handled array-based, question-nested, and label-keyed response payloads; parses stringly-typed numbers and NaN values defensively.
- **Zero-Failure Guarantee**: On missing API key, network timeout, or schema mutation, silently defaults to uniform `[0.25, 0.25, 0.25, 0.25]` with `fallback: true` and `ok: false`. Never raises 500.
