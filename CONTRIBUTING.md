# Contributing to Mammoth Bots

Thanks for your interest in contributing to Mammoth Bots. This project is a playful browser-based experiment that combines LLM-generated decision-making, physics-driven robot motion, and a lightweight TypeScript stack. We welcome bug reports, refinements, docs updates, and creative feature ideas.

## Ways to contribute

You can help by:

- Reporting bugs or unclear behavior
- Improving documentation and onboarding
- Fixing issues in the frontend or worker
- Adding tests for model fallback, UI behavior, or event logic
- Proposing new robot behaviors or interaction patterns
- Refactoring or simplifying the code without changing the intended experience

## Project structure

This repo is organized as a monorepo:

- `frontend/` — Vite + TypeScript app with the canvas, robots, and UI
- `worker/` — Cloudflare Worker backend for API orchestration and model calls
- `package.json` — root workspace configuration

## Development setup

### Prerequisites

- Node.js 18+
- npm
- Optional: Groq API key and OpenRouter API key for live model behavior

### Install dependencies

```bash
git clone https://github.com/JanardhanS56/mammoth-bots.git
cd mammoth-bots
npm install
```

### Environment variables

Create a `.env` file at the repo root with the values your local run needs:

```env
groq_api_key=your_groq_api_key_here
groq_model_name=llama-3.3-70b-versatile
open_router_api_key=your_openrouter_api_key_here
model_name=baseten/mammoth-1:free
```

If the keys are absent, the app can fall back to mock behavior, which is useful for local testing and debugging.

### Run the app locally

Start the frontend and worker in separate terminals:

```bash
npm run dev -w frontend
npm run dev -w worker
```

Then open the frontend URL shown by Vite in the browser. The worker will provide the backend API layer used by the app.

## Testing

Run the repo test suite from the root:

```bash
npm test
```

You can also run workspace-specific tests:

```bash
npm test -w frontend
npm test -w worker
```

## Build checks

Before opening a pull request, verify that the app still builds:

```bash
npm run build -w frontend
npm run build -w worker
```

## Contribution workflow

1. Fork the repository and create a feature branch.
2. Keep changes focused and easy to review.
3. Write or update tests when behavior changes.
4. Validate the affected commands locally before opening a PR.
5. Open a pull request with a clear description of:
   - the problem being solved
   - the change made
   - any environment or behavior differences

## Coding guidelines

- Prefer simple, readable TypeScript.
- Keep UI logic and backend logic separated where possible.
- Avoid introducing secret or sensitive keys into the client bundle.
- Keep robot behavior changes understandable and deterministic when possible.
- If you add new APIs or request flows, document the expected inputs and outputs.
- Maintain compatibility with the project’s lightweight, browser-first architecture.

## Bug reports

When filing a bug, include:

- what you expected to happen
- what actually happened
- steps to reproduce
- browser or runtime details
- screenshots or a short video if relevant
- whether the issue occurs with mock fallback or live API keys enabled

## Feature ideas

If you want to propose a larger feature, open an issue first so the direction can be discussed before implementation. This project has a strong experimental tone, so early discussion helps keep changes aligned with the project’s goals.

## Pull request expectations

A good PR for this repo should:

- be scoped and easy to review
- explain why the change is useful
- include tests when practical
- avoid unrelated refactors
- describe any UX or backend impact clearly

## Community expectations

Please keep discussions respectful, curious, and constructive. This project is intentionally playful and experimental, but good collaboration still matters.

Thanks for helping build weird little robots with bigger opinions.
