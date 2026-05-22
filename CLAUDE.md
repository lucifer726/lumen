# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. One command spins up both the static server and the Codex bridge:

```bash
./start.sh
# bridge:  http://127.0.0.1:8787
# web:     http://127.0.0.1:5173
```

Ctrl-C tears down both. Override ports via `LUMEN_WEB_PORT`, `LUMEN_CODEX_PORT`, hosts via `LUMEN_WEB_HOST`, `LUMEN_CODEX_HOST`. Other bridge env vars (see `codex-bridge.mjs`): `LUMEN_CODEX_BIN` (default `codex`), `LUMEN_CODEX_CWD`, `LUMEN_CODEX_MODEL`, `LUMEN_CODEX_PROFILE`, `LUMEN_CODEX_TIMEOUT_MS`.

The frontend talks to `http://127.0.0.1:8787` by default; override via `window.LUMEN_LLM_ENDPOINT` or `localStorage.lumen_llm_endpoint` (only the base URL is used — paths are appended). If the bridge is offline, the chat falls back to the nearest preset in `examples.js`.

There are no tests, no linter, and no package manifest — JSX is compiled in-browser by `@babel/standalone` (loaded via CDN in `index.html`).

## Architecture

Lumen turns a Chinese math prompt into a 3Blue1Brown-style Canvas animation. The whole pipeline lives in four scripts loaded by `index.html` in this order: `examples.js` → `viz-runtime.jsx` → `tweaks-panel.jsx` → `chat.jsx` → `app.jsx`. Order matters because later files read globals attached by earlier ones (`window.VIZ_EXAMPLES`, `window.VIZ_HELPERS`, `window.compileSpec`, `window.SvgIcon`, `window.ChatPanel`).

### The "spec" contract is the center of everything

Every visualization — preset or LLM-generated — is a plain object of this shape (full schema in the `SYSTEM_PROMPT` constant in `chat.jsx`):

```
{ id, title, category, formula, glyph, hideFormula, intro, explanation,
  params:[{name,label,min,max,step,default}], duration, loop,
  draw(ctx,w,h,p,t,state,H), setup?(state,p,w,h,H) }
```

- **Presets** (`examples.js`) ship `draw` as a real JS function.
- **Codex output** ships `draw` as a string (function body); `compileSpec` in `viz-runtime.jsx` turns it into a real function via `new Function(...)`. Anything that JSON-serializes a spec must round-trip through `serializeSpec`/`deserializeSpec` in `app.jsx` (functions don't survive JSON — presets are stored as `{__preset:id}` refs).
- `t ∈ [0,1]` is animation progress; the staged-reveal convention `H.fade(t, t0, t1)` is enforced by the system prompt and is also how `extractStages` (`viz-runtime.jsx:482`) auto-derives the stage-chip row under the timeline.

### The H helper object (`window.VIZ_HELPERS`)

Built in `buildHelpers()` (`viz-runtime.jsx:31`) and exposed as `window.VIZ_HELPERS`. Every `draw()` — preset or generated — receives it as the last arg. It bundles colors, fonts, shape primitives (`region`, `traceRect`, `dimBracket`, `formula`, `plot`, `axes`, `mapper`…), and easing/timing helpers (`fade`, `lerp`, `smooth`, `stagger`). The system prompt in `chat.jsx` documents the full surface; keep that prompt and `buildHelpers()` in sync when adding/renaming helpers.

### Chat → LLM → spec flow (`chat.jsx` + `codex-bridge.mjs`)

1. `sendPrompt` appends a user message + thinking placeholder.
2. `getLocalChatReply` short-circuits greetings / non-math chit-chat.
3. `generateViz` POSTs `{ sessionId, system, message }` to the bridge. The frontend does **not** send conversation history — codex maintains it.
4. **Bridge session mapping** (`codex-bridge.mjs`): each frontend `sessionId` is mapped 1:1 to a codex `thread_id`, persisted at `.lumen/sessions.json`. First call runs `codex exec --json` (sandbox=read-only, cwd=repo) and parses `thread.started` from the JSONL stream to capture the new id. Subsequent calls run `codex exec resume <thread_id> --json`. Per-session locks serialize concurrent requests so order is preserved. `SYSTEM_PROMPT` is injected only on the first turn of a session; later turns send only the user message — codex remembers the contract from the persisted history.
5. **`codex exec resume` flag quirk**: resume accepts only a subset of flags (`--skip-git-repo-check`, `--model`, `--json`, …). It does **not** accept `--sandbox` / `--cd` / `--profile` — those are baked into the persisted session. `firstCallArgs()` vs `resumeCallArgs()` in `codex-bridge.mjs` reflect this; do not merge them.
6. `tryExtractJson` is lenient: strips ```json fences, then `JSON.parse` → `fixLatexEscapes` (LaTeX backslashes inside strings) → `normalizeLooseJson` (raw CR/LF in strings). Codex output often violates strict JSON because of `\sin` / `\theta`; do not tighten this without re-checking real Codex replies.
7. `dryRunSpec` compiles + runs `draw` at `t=0` and `t=0.5` on an off-screen canvas. On failure, the chat **auto-retries once** with the error appended to the user message (`errorFeedback`). Same path is taken when the runtime later catches a draw error (`handleRuntimeError` in `app.jsx` → `chatSendRef.current(prompt, {silent, sourcePrompt, errorFeedback})`).
8. **Session lifecycle**: deleting / clearing chats in the UI calls `DELETE /v1/session/<id>` so the bridge drops its mapping. The codex rollout files under `~/.codex/sessions/...` are not deleted — they're harmless and useful for debugging.

### Sessions & persistence (`app.jsx`)

Sessions live in `localStorage[vz_sessions_v4]`. Thinking placeholders are stripped on save. The first session is pre-seeded with `VIZ_EXAMPLES[0]` so the canvas never flashes empty on first paint. Tweaks (`accent`, `density`, `speed`, `autoPlay`, `showAxes`, `mathFont`) are pushed onto `:root` as CSS custom properties (`--vz-accent`, plus derived `--vz-accent-soft`/`--vz-accent-line`).

### VizRuntime (`viz-runtime.jsx`)

Owns the canvas, RAF loop, timeline scrubber, parameter sliders, KaTeX overlay, the in-place code editor (`CodePanel`), and PNG/WebM export (`ExportMenu`). The "stage chips" under the timeline are inferred from `H.fade(t, X, ...)` literals in the source — that's why generated specs are expected to use `H.fade` for staging rather than ad-hoc `if (t > 0.3)` branches.

### Tweaks panel (`tweaks-panel.jsx`)

The `EDITMODE-BEGIN`/`EDITMODE-END` markers around `TWEAK_DEFAULTS` in `app.jsx:6` are real — they are how the tweaks panel finds the literal to rewrite when the user changes a tweak. Don't reformat or move that block.

## Conventions specific to this repo

- **All UI strings are Simplified Chinese.** Match the existing tone in error messages, prompt chips, and the system prompt.
- **Canvas-first aesthetic**: solid `#0A0E14` background, white outlines for framing, manim-style coral dimension brackets, italic serif for math (`H.FONT_MATH`), sans for Chinese (`H.FONT_SANS`). The system prompt enumerates the fill/stroke pairs for region colors — keep canvas regions and the colored terms in the title formula in sync (same color = same name).
- **No emoji**, even in commit messages and UI copy (per global `~/.claude/CLAUDE.md`).
- The `draw()` sandbox bans `document` / `window` / `fetch` / `require` / `import`. Stick to `Math.*` and `H.*` in generated code; if you need a new capability, expose it through `H` rather than the global scope.
- When editing the system prompt, remember that escaped backslashes need to survive both the template literal and the JSON the LLM emits — the system prompt itself shows the `\\\\theta` convention.
