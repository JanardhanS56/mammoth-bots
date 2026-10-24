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

## M7: Reveal Animation & Client State Machine
- **State Flow**: Integrated strict state progression: `IDLE` → `THINKING` → `REVEALING` (600ms) → `SETTLED` (800ms) → `IDLE`.
- **Wander Freeze**: Freezes bot steering turning force during reveal phase (`turnRate = 0`).
- **Ease-Out Cubic Lerp**: Scales bots smoothly over 600ms according to target formula `targetScale = 0.6 + p` (0.6× for p=0 to 1.6× for p=1), ensuring the winner is visibly largest.
- **Session Caching**: Wrapped API calls with client `sessionStorage` cache under key `mammoth-cache-v1` with immediate instant recall for identical questions.
- **Accessibility Mirroring**: Mirrored verdict and probability into `#a11y-result` with `aria-live="polite"`.

## M8: Crowns, Speech Bubbles, and Coin-Flip Bumps
- **Winner's Crown Animation**: Implemented 3-point gold crown popping at t=200ms with scale overshoot curve (`0 → 1.15 → 1.0` over 300ms) sitting directly atop the winner bot.
- **Microcopy-Driven Speech Bubbles**: Bubbles pop in at t=600ms; winner says its option label (or `"ha."` on winning streaks ≥ 2); losers react with `"…"`, `"hmph."`, or `"why do I even"` based on streak depth.
- **Coin-Flip Near-Tie Behavior**: When `margin < 0.05` (`coinFlip: true`), crown is strictly suppressed; top two bots physically bump twice into each other between 150ms and 550ms, then break contact and stare straight into the camera (eye offsets = 0, 0).

## M9: Nerd Mode Inspector (Tags, Toggle & Metrics Panel)
- **Persistent Toggle & Peek**: Created `setupNerdMode()` with toggle button (`[?]`) persisting state under `mammoth-nerd-v1` in `localStorage`, plus instantaneous keyboard peek on holding `H` or `?`.
- **Per-Bot Floating Tags**: Rendered 26px above bot top boundary, clamped to `y >= 40` to avoid viewport clipping. Displays option label, formatted whole-number percentage (`NN%` - never raw floats), and 96×6px probability bar (full bot color for winner, 50% alpha for others).
- **Responsive Layout**: On mobile viewports under 480px, automatically drops the label line to conserve vertical canvas space while keeping the bar and percentage.
- **Nerd Telemetry Panel**: Fixed bottom-left 11px monospace panel showing neutral restatement `state`, `chosen` slot, `margin` %, and `⚠ coin flip` warning when margin < 0.05.

## M10: Persistent Moods, Streaks, Halos, and Amnesia Reset
- **Persistent Memory Model**: Preserved win/loss history under `mammoth-bots-v1` in `localStorage`, updating win streaks (`max(1, s+1)`) and loss streaks (`min(-1, s-1)`), clamped strictly within `[-6, 6]`.
- **Physical Mood Representation**: Mood `clamp(streak / 3, -1, 1)` drives:
  - Multiplicative scale (`moodScale * revealScale`), preserving relative reveal hierarchy.
  - Antenna drooping from `-0.55 * mood` radians.
  - Halo radial brightness and alpha (`0.18 → 0.48`).
  - Asymmetric sad squash (vertical flattening + horizontal bulging).
  - Loser sulking: bots with `mood < -0.4` actively steer away from the last winner's location (`lastWinnerPos`).
- **Natural Decay & Amnesia**: On page load, `decayStreaks()` cuts streaks in half towards 0 (`floor/2` or `ceil/2`) to prevent bots from remaining permanently depressed. Clicking `[forget everything]` completely wipes `mammoth-bots-v1` and resets all robots to neutral baseline.

## M11: Two-Tier Caching, Token-Bucket Rate Limiting & Accessibility Hardening
- **Server-Side KV Caching**: Cached full `DecideResponse` instances by normalized query hash `decide:<sha256>` with 24-hour expiration TTL (`86400s`), returning instantly with `cached: true`.
- **IP Token Bucket Rate Limiting**: Enforced rate limiting of 10 requests per hour per IP via Cloudflare KV key `rate:<clientIp>:<hourWindow>`, issuing HTTP 429 and toast `"the robots need a break"` on exhaustion.
- **Fail-Safe Shrug Animation**: On Mammoth API timeout or key disruption, automatically delivers uniform `0.25` distribution with `fallback: true` and toast `"the robots forgot how to decide"`. All bots shrug at equal size with zero broken states.
- **Full Accessibility Compliance**: Mirrored outcomes into `aria-live="polite"` region, provided sr-only form labels, real button elements with `aria-pressed`, and instant one-frame reveals under `prefers-reduced-motion: reduce`.

## M12: Production Build, Secret Leak Audit & Deployment Preparation
- **Bundle Optimization**: Built static bundle with Vite and TypeScript producing only 16.90 KB uncompressed (7.01 KB gzipped) client JavaScript, well below the 30 KB budget limit.
- **Zero-Secret Bundle Verification**: Verified `dist/` directory with automated pattern scanning (`grep -r "GROQ_API_KEY\|BASETEN_API_KEY" frontend/dist/`), confirming `clean` output with 0 leaked tokens.
- **Cloudflare Target Preparation**: Configured `wrangler.toml` for Cloudflare Workers API backend and Pages static hosting with KV namespace bindings.

## M13: OpenRouter Decisions API & Live Integration Verification
- **OpenRouter Mammoth-1 Vendor Firewall**: Integrated OpenRouter Decisions API (`POST https://openrouter.ai/api/alpha/decisions`) supporting `baseten/mammoth-1:free` model with typed slot criteria (`no`, `yes`, `jester`, `prophet`).
- **Groq Dynamic Model Binding**: Supported `openai/gpt-oss-120b` and `llama-3.3-70b-versatile` through `GROQ_MODEL` environment configuration.
- **Vite Dev Worker Bridge**: Connected Vite dev server (`http://localhost:5173/api/decide`) directly to the Cloudflare Worker runtime logic using local `.env` variables for seamless local testing without secret leakage.
- **Live End-to-End Validation**: Verified live API decision and browser animation (`Should I adopt a robot?`), verifying argmax winner, crown animation, speech bubble, and amnesia reset.

## M14: Minimalist Geometric White UI & Interactive Handheld Placards
- **White Sketchbook Canvas**: Shifted from dark theme to clean white background (`#FFFFFF`) with subtle 28px micro-dot architectural grid.
- **4 Distinct Geometric Shapes & Primary Colors**:
  - Circle (Blue `#2563EB`)
  - Triangle (Green `#16A34A`)
  - Diamond (Red `#DC2626`)
  - Squircle / Round-edged Square (Yellow `#EAB308`)
- **Handheld Option & Probability Boards**: Unnamed bots physically carry placards displaying bold probability percentages and formulated option copy, tilting dynamically with steering velocity.
- **Tactile Non-AI Human Interactivity**:
  - Ephemeral colored roaming dashed trails showing paths as agents wander across the white canvas.
  - Interactive click ripple shockwaves pushing nearby bots with tactile physics.
  - Expressive animated eyes tracking the cursor smoothly with natural periodic blinks.
  - Direct bot poke reactions with playful hop physics.
## M15: Update 1.1 Tactile Physics, Scrum Huddle, Confetti & Synthesized Audio
- **Robot Scrum Huddle Animation**: While Groq & Mammoth are processing in the `THINKING` state, all 4 bots smoothly converge into a central circular huddle, murmuring with animated speech bubbles (`?`, `…`, `!`, `~`) and subtle synthesized audio clicks.
- **Celebratory Geometric Confetti**: Winner reveal triggers a 36-particle geometric confetti explosion (mini circles, triangles, diamonds, and squares) bursting upward and fluttering down the canvas with gravity and air resistance.
- **Drag-and-Toss Agent Interactivity**: Any bot can be clicked, lifted, and dragged across the canvas, with realistic contact shadow diffusion and inertia-based toss release physics.
- **Placard Verlet Spring Wobble**: Handheld boards now oscillate with angular spring damping (`targetAngle - placardAngle`), wobbling naturally as agents steer and stop.
- **Synthesized Web Audio SFX**: Integrated zero-asset native `AudioContext` synthesizer generating gentle frequency sweeps for pokes, tosses, huddle murmurs, and chord chimes on reveal, with top-bar toggle `[sound: on/off]`.
- **Preset Dilemma Pills**: Embedded 1-click test dilemma chips (`"Should I adopt 3 cats?"`, `"Coffee or matcha?"`, `"Is pizza breakfast?"`) above the search bar.

## M16: De-AI UI Redesign, Tactile Architecture & Organic Motion Dynamics
- **De-Pill & Tactile Geometry**:
  - Replaced generic 100px pill buttons and fuzzy drop shadows with 4–6px architectural borders and solid 2px/4px offset drop shadows.
  - Eliminated the pulsing neon AI glow dot (`.brand-dot`); introduced an engineering titleplate `[MB-04]` and an explicit system role descriptor.
  - Swapped generic AI demo chip copy for genuine human dilemmas (`Open a Lisbon bakery?`, `Refactor monolith or camp?`, `Adopt 3rd rescue dog?`).
- **Motion Asymmetry & Burstiness**:
  - Eliminated uniform 2000ms breathing/bobbing cycles; each shape has distinct harmonic cadences (`1850ms`, `2350ms`, `1980ms`, `2600ms`) and desynchronized eye blink rhythms.
  - Staggered speech reveal delays: winner reacts first at `480ms`, followed by runners-up at `570ms`, `600ms`, `640ms`, and `710ms`.
  - Replaced repetitive reactions with shape-specific human dialogues (e.g., Circle: `"called it twice."` / `"wait, what?"`, Triangle: `"predictable trend."` / `"rechecking math."`, Diamond: `"bow before genius!"` / `"are you serious?"`, Squircle: `"written in stone."` / `"fair enough."`).
- **Architectural Drafting Layout**:
  - Grounded empty white canvas with drafting corner registration brackets, coordinate crosshairs (`+`) at 112px intervals, and subtle scale ratio watermark metadata (`GRID // 28PX RATIO 1:1`).
- **Semantic Source & SEO**:
  - Added descriptive meta tags, explicit title, and `<noscript>` semantic block so `View Page Source` contains real readable document text.
