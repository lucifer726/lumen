# Agent Instructions

These instructions apply to this repository.

## Project Summary

Lumen is a local-first math visualization app. It is a static React/Babel frontend loaded from `index.html`, plus a Node bridge (`codex-bridge.mjs`) that calls `codex exec` to generate visualization specs.

There is no build step and no dependency install step for the app itself.

## Run And Verify

```bash
./start.sh
```

Open `http://127.0.0.1:5173/`.

Useful checks:

```bash
node --check codex-bridge.mjs
python3 -m http.server 5173 --bind 127.0.0.1
```

Stop servers before finishing unless the user asked to keep them running.

## File Map

- `index.html`: page entry and CDN dependencies.
- `examples.js`: built-in visualization presets.
- `viz-runtime.jsx`: Canvas runtime, helper object, timeline, code editor, export.
- `tweaks-panel.jsx`: visual tweak controls.
- `chat.jsx`: chat UI, system prompt, Codex request path, JSON/spec validation.
- `app.jsx`: top-level state, sessions, settings, persistence.
- `codex-bridge.mjs`: local HTTP adapter for Codex CLI.
- `CLAUDE.md`: detailed architecture notes. Read it before changing prompt/runtime/bridge behavior.

## Coding Rules

- Keep changes small and local to the requested behavior.
- Do not add dependencies or introduce a bundler unless explicitly requested.
- Keep UI strings in Simplified Chinese.
- Do not use emoji in UI copy, docs, commit messages, or generated examples.
- Prefer existing helper APIs in `window.VIZ_HELPERS` over direct Canvas boilerplate when authoring examples.
- Preserve the script load order in `index.html`:
  `examples.js` -> `viz-runtime.jsx` -> `tweaks-panel.jsx` -> `chat.jsx` -> `app.jsx`.

## Visualization Spec Contract

Every visualization is a plain spec object:

```js
{ id, title, category, formula, glyph, hideFormula, intro, explanation,
  params, duration, loop, setup, draw }
```

`draw(ctx, w, h, params, t, state, H)` is required. `t` is animation progress from `0` to `1`. Use `H.fade(t, start, end)` for staged reveals so `extractStages()` can infer timeline chips.

When adding or renaming helpers, update both:

- `buildHelpers()` in `viz-runtime.jsx`
- `SYSTEM_PROMPT` in `chat.jsx`

## Persistence And Generated State

Do not commit local runtime state:

- `.lumen/`
- `.omx/`
- `.traces/`
- `uploads/`
- IDE metadata and system files

Browser sessions are stored in `localStorage[vz_sessions_v4]`. Bridge thread mappings are stored in `.lumen/sessions.json`.

## Important Edge Cases

- `codex exec` and `codex exec resume` accept different flags. Keep `firstCallArgs()` and `resumeCallArgs()` separate.
- `tryExtractJson()` intentionally accepts loose JSON because generated LaTeX often contains backslash escapes. Do not tighten it without testing real Codex output.
- The `EDITMODE-BEGIN` and `EDITMODE-END` markers around `TWEAK_DEFAULTS` in `app.jsx` are used by the tweak editor. Do not move or reformat that block unless you update the editor logic too.
