#!/usr/bin/env node

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST = process.env.LUMEN_CODEX_HOST || "127.0.0.1";
const PORT = Number(process.env.LUMEN_CODEX_PORT || 8787);
const CODEX_BIN = process.env.LUMEN_CODEX_BIN || "codex";
const CODEX_CWD = process.env.LUMEN_CODEX_CWD || process.cwd();
const CODEX_TIMEOUT_MS = Number(process.env.LUMEN_CODEX_TIMEOUT_MS || 180000);
const CODEX_MODEL = process.env.LUMEN_CODEX_MODEL || "";
const CODEX_PROFILE = process.env.LUMEN_CODEX_PROFILE || "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, ".lumen");
const STATE_FILE = path.join(STATE_DIR, "sessions.json");

// sessionId (frontend) -> codex thread_id
const sessionMap = new Map();
// per-session lock so concurrent requests from the same chat don't race
const sessionLocks = new Map();

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed?.sessions || {})) {
      if (typeof v === "string") sessionMap.set(k, v);
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[bridge] state load failed:", e.message);
  }
}

async function persistState() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    const obj = { sessions: Object.fromEntries(sessionMap) };
    await writeFile(STATE_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.warn("[bridge] state save failed:", e.message);
  }
}

function withSessionLock(sessionId, fn) {
  const prev = sessionLocks.get(sessionId) || Promise.resolve();
  const next = prev.then(fn, fn);
  sessionLocks.set(sessionId, next.catch(() => {}));
  return next;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

function buildFirstPrompt(system, message) {
  return [
    "You are the LLM backend for the local Lumen math visualization app.",
    "Return only the final assistant response requested by the app.",
    "Do not edit files, run project commands, or include commentary outside the requested output.",
    "",
    "<system>",
    String(system || ""),
    "</system>",
    "",
    "<user>",
    String(message || ""),
    "</user>",
  ].join("\n");
}

function buildResumePrompt(message) {
  return `<user>\n${String(message || "")}\n</user>`;
}

// `codex exec` and `codex exec resume` accept different flag sets:
//   - resume does NOT accept --sandbox / --cd / --profile (those come from the
//     persisted session). Only --skip-git-repo-check / --model / --json apply.
function firstCallArgs() {
  const args = ["--skip-git-repo-check", "--sandbox", "read-only", "--cd", CODEX_CWD, "--json"];
  if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
  if (CODEX_PROFILE) args.push("--profile", CODEX_PROFILE);
  return args;
}
function resumeCallArgs() {
  const args = ["--skip-git-repo-check", "--json"];
  if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
  return args;
}

// Run codex once, streaming JSONL events. Returns { threadId, text }.
async function runCodex({ resumeThreadId, prompt }) {
  const args = resumeThreadId
    ? ["exec", "resume", ...resumeCallArgs(), resumeThreadId, "-"]
    : ["exec", ...firstCallArgs(), "-"];

  return new Promise((resolve, reject) => {
    const child = spawn(CODEX_BIN, args, {
      cwd: CODEX_CWD,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let threadId = resumeThreadId || null;
    let lastAgentMessage = "";
    let stderr = "";
    let stdoutBuf = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`codex exec timed out after ${CODEX_TIMEOUT_MS}ms`));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      let nl;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === "thread.started" && evt.thread_id) threadId = evt.thread_id;
        if (evt.type === "item.completed" && evt.item?.type === "agent_message" && typeof evt.item.text === "string") {
          lastAgentMessage = evt.item.text;
        }
      }
    });

    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`codex exec exited with code ${code}. ${stderr.slice(-400) || lastAgentMessage}`));
        return;
      }
      if (!lastAgentMessage) {
        reject(new Error(`codex exec produced no agent_message. ${stderr.slice(-400)}`));
        return;
      }
      resolve({ threadId, text: lastAgentMessage.trim() });
    });

    child.stdin.end(prompt);
  });
}

async function handleComplete(req, res) {
  const payload = await readJson(req);
  const sessionId = String(payload.sessionId || "").trim();
  const message = String(payload.message || "").trim();
  const system = String(payload.system || "");
  if (!sessionId) return sendJson(res, 400, { error: "sessionId is required" });
  if (!message) return sendJson(res, 400, { error: "message is required" });

  const result = await withSessionLock(sessionId, async () => {
    const existing = sessionMap.get(sessionId);
    if (existing) {
      try {
        return await runCodex({ resumeThreadId: existing, prompt: buildResumePrompt(message) });
      } catch (err) {
        // Only fall through when the thread file is genuinely missing; surface
        // every other failure so we don't silently lose conversation state.
        if (!/no such session|session .* not found|no recorded session/i.test(err.message)) throw err;
        console.warn(`[bridge] resume failed for ${sessionId}, starting fresh:`, err.message);
        sessionMap.delete(sessionId);
      }
    }
    const fresh = await runCodex({ resumeThreadId: null, prompt: buildFirstPrompt(system, message) });
    if (fresh.threadId) {
      sessionMap.set(sessionId, fresh.threadId);
      persistState();
    }
    return fresh;
  });

  sendJson(res, 200, { text: result.text, threadId: result.threadId });
}

function handleDeleteSession(req, res, sessionId) {
  if (!sessionId) return sendJson(res, 400, { error: "sessionId required" });
  const had = sessionMap.delete(sessionId);
  if (had) persistState();
  sendJson(res, 200, { ok: true, removed: had });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return sendJson(res, 204, {});

    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, backend: "codex-exec", sessions: sessionMap.size });
    }

    if (req.method === "POST" && req.url === "/v1/complete") {
      return await handleComplete(req, res);
    }

    const m = req.url && req.url.match(/^\/v1\/session\/([^/?#]+)$/);
    if (m && req.method === "DELETE") {
      return handleDeleteSession(req, res, decodeURIComponent(m[1]));
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

await loadState();
server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`);
  console.log(`[bridge] POST /v1/complete  { sessionId, system, message }`);
  console.log(`[bridge] DELETE /v1/session/<id>`);
  console.log(`[bridge] codex bin: ${CODEX_BIN}  cwd: ${CODEX_CWD}`);
  if (sessionMap.size) console.log(`[bridge] restored ${sessionMap.size} session mapping(s)`);
});
