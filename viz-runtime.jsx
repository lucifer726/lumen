// VizRuntime — runs a spec (preset or Codex-generated) inside a canvas with
// timeline + parameter sliders + LaTeX overlays. Exposes a small drawing helper
// object so user/Codex-authored draw() functions stay short.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ---------- helper palette: mimic Manim defaults ----------
const VIZ_COLORS = {
  fg: "#E8ECF1",
  muted: "#9AA4B2",
  dim: "rgba(255,255,255,0.18)",
  axis: "rgba(255,255,255,0.25)",
  grid: "rgba(255,255,255,0.07)",
  blue: "#58C4DD",
  blueRGBA: "rgba(88,196,221,1)",
  teal: "#77EDEF",
  yellow: "#FFD24C",
  yellowRGBA: "rgba(255,210,76,1)",
  red: "#FC6255",
  redRGBA: "rgba(252,98,85,1)",
  green: "#83C167",
  greenRGBA: "rgba(131,193,103,1)",
  purple: "#9A72AC",
  orange: "#F0A95F",
  pink: "#E879A8",
  coral: "#E89B95",      // dimension brackets
};
const FONT_SANS = `-apple-system, "Segoe UI", "Helvetica Neue", sans-serif`;
const FONT_MATH = `"STIX Two Math", "Latin Modern Math", "Cambria Math", Georgia, serif`;

function buildHelpers() {
  return {
    COL: VIZ_COLORS,
    FONT_SANS,
    FONT_MATH,

    clear(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
    },

    grid(ctx, cx, cy, w, h, step = 40) {
      ctx.strokeStyle = VIZ_COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = cx % step; x < w; x += step) {
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let y = cy % step; y < h; y += step) {
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
    },

    axes(ctx, cx, cy, w, h) {
      ctx.strokeStyle = VIZ_COLORS.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy); ctx.lineTo(cx + w / 2, cy);
      ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx, cy + h / 2);
      ctx.stroke();
      // arrowheads
      const a = 6;
      ctx.fillStyle = VIZ_COLORS.axis;
      ctx.beginPath();
      ctx.moveTo(cx + w / 2, cy); ctx.lineTo(cx + w / 2 - a, cy - a / 2); ctx.lineTo(cx + w / 2 - a, cy + a / 2); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx - a / 2, cy - h / 2 + a); ctx.lineTo(cx + a / 2, cy - h / 2 + a); ctx.closePath();
      ctx.fill();
    },

    arrow(ctx, x1, y1, x2, y2, opts = {}) {
      const stroke = opts.stroke || VIZ_COLORS.fg;
      const width = opts.width || 2;
      const head = opts.head || 8;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const bx = x2 - ux * head, by = y2 - uy * head;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
      // head triangle
      const px = -uy, py = ux;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(bx + px * head * 0.45, by + py * head * 0.45);
      ctx.lineTo(bx - px * head * 0.45, by - py * head * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = "butt";
    },

    circle(ctx, x, y, r, opts = {}) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fill(); }
      if (opts.stroke !== false) {
        ctx.strokeStyle = opts.stroke || VIZ_COLORS.fg;
        ctx.lineWidth = opts.width || 1.5;
        ctx.stroke();
      }
    },

    dot(ctx, x, y, r, color) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color || VIZ_COLORS.fg;
      ctx.fill();
    },

    line(ctx, x1, y1, x2, y2, opts = {}) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = opts.stroke || VIZ_COLORS.fg;
      ctx.lineWidth = opts.width || 1.5;
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.stroke();
      if (opts.dash) ctx.setLineDash([]);
    },

    plot(ctx, fn, opts = {}) {
      const { x0 = 0, x1 = 100, xToPx, yToPy, color = VIZ_COLORS.blue, width = 2 } = opts;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      let started = false;
      const steps = opts.steps || 400;
      for (let i = 0; i <= steps; i++) {
        const x = x0 + (x1 - x0) * (i / steps);
        const y = fn(x);
        if (!isFinite(y)) { started = false; continue; }
        const sx = xToPx(x), sy = yToPy(y);
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    },

    text(ctx, str, x, y, opts = {}) {
      ctx.fillStyle = opts.color || VIZ_COLORS.fg;
      const it = opts.italic ? "italic " : "";
      const sz = opts.size || 13;
      const font = opts.font || FONT_SANS;
      ctx.font = `${it}${sz}px ${font}`;
      ctx.textAlign = opts.align || "left";
      ctx.fillText(str, x, y);
      ctx.textAlign = "left";
    },

    legendBox(ctx, x, y, color, dashed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 14, y);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    // pre-built mappers — call as `const M = H.mapper({xMin:-5,xMax:5,yMin:-2,yMax:2,padL,padR,padT,padB,w,h})`
    mapper({ xMin, xMax, yMin, yMax, padL = 40, padR = 20, padT = 30, padB = 30, w, h }) {
      const gw = w - padL - padR, gh = h - padT - padB;
      const sx = gw / (xMax - xMin);
      const sy = gh / (yMax - yMin);
      return {
        xToPx: (x) => padL + (x - xMin) * sx,
        yToPy: (y) => padT + (yMax - y) * sy,
        gw, gh, padL, padR, padT, padB,
      };
    },

    // ============================================================
    //  ANIMATION PRIMITIVES — stage-based reveals
    // ============================================================

    // Smoothstep easing
    smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); },
    easeInOut(x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; },
    easeOutCubic(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); },

    // fade(t, t0, t1) → 0..1 with smoothstep. Use for stage windows.
    // fade(t, t0, t1, t2, t3) → ramps up [t0,t1], holds 1 in [t1,t2], ramps down [t2,t3].
    fade(t, t0, t1, t2, t3) {
      if (t2 === undefined) {
        if (t <= t0) return 0;
        if (t >= t1) return 1;
        const x = (t - t0) / (t1 - t0);
        return x * x * (3 - 2 * x);
      }
      if (t <= t0) return 0;
      if (t >= t3) return 0;
      if (t < t1) {
        const x = (t - t0) / (t1 - t0);
        return x * x * (3 - 2 * x);
      }
      if (t < t2) return 1;
      const x = 1 - (t - t2) / (t3 - t2);
      return x * x * (3 - 2 * x);
    },

    // Linear interpolation
    lerp(a, b, t) { return a + (b - a) * t; },

    // Apply alpha to a hex/rgb color string. Returns rgba string.
    alpha(color, a) {
      if (color.startsWith("rgba")) {
        return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${a})`);
      }
      if (color.startsWith("rgb")) {
        return color.replace(/rgb\(([^,]+),([^,]+),([^)]+)\)/, `rgba($1,$2,$3,${a})`);
      }
      // hex
      let h = color.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    },

    // ============================================================
    //  MANIM-STYLE PRIMITIVES
    // ============================================================

    // Multi-segment formula. Renders horizontally at (cx, cy) center-aligned.
    // segments: [{ text, color?, italic?, weight?, alpha? }, ...]
    // opts: { size, gap, baseColor, baseFont } — gap is extra pixels between segs (0 default).
    formula(ctx, segments, cx, cy, opts = {}) {
      const size = opts.size || 28;
      const baseColor = opts.baseColor || VIZ_COLORS.fg;
      const baseFont = opts.baseFont || FONT_MATH;
      const gap = opts.gap || 0;
      // First pass: measure
      const widths = segments.map((s) => {
        const it = s.italic !== false ? "italic " : "";
        const wt = s.weight || "";
        ctx.font = `${it}${wt} ${size}px ${baseFont}`.trim();
        return ctx.measureText(s.text).width;
      });
      const total = widths.reduce((a, b) => a + b, 0) + gap * (segments.length - 1);
      let x = cx - total / 2;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      segments.forEach((s, i) => {
        const it = s.italic !== false ? "italic " : "";
        const wt = s.weight || "";
        ctx.font = `${it}${wt} ${size}px ${baseFont}`.trim();
        // If a baked alpha is in s.color (e.g., rgba(...,0.4)), keep it as-is.
        // s.alpha is an OPTIONAL extra multiplier.
        const col = s.color || baseColor;
        ctx.fillStyle = s.alpha == null ? col : this.alpha(col, s.alpha);
        ctx.fillText(s.text, x, cy);
        x += widths[i] + gap;
      });
      ctx.textBaseline = "alphabetic";
      return total;
    },

    // Dimension bracket — manim/3B1B style. Dashed line between two points
    // with arrowheads on both ends and an asterisk at the split point with
    // labels on each segment.
    //
    // (x1,y1) → (x2,y2) defines the line. labels = ["b","a"] for first/second
    // segment. splitT ∈ [0,1] is the asterisk's relative position along the line.
    // labelSide: +1 = labels on left side of vector, -1 = right side.
    dimBracket(ctx, x1, y1, x2, y2, opts = {}) {
      const {
        color = VIZ_COLORS.coral,
        labels = ["", ""],
        splitT = 0.5,
        alpha = 1,
        labelSide = 1,
        labelOffset = 22,
        labelSize = 18,
        labelColor = VIZ_COLORS.fg,
        showSplit = true,
      } = opts;
      if (alpha <= 0.01) return;

      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // perpendicular (rotate -90 in screen coords for labelSide=+1: out the "left" of the vector)
      const nx = -uy * labelSide, ny = ux * labelSide;

      const sx = x1 + ux * len * splitT;
      const sy = y1 + uy * len * splitT;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";

      const gap = 6;
      const headLen = 9;

      // Dashed segments with gaps at ends and middle
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      if (showSplit) {
        ctx.moveTo(x1 + ux * headLen, y1 + uy * headLen);
        ctx.lineTo(sx - ux * gap, sy - uy * gap);
        ctx.moveTo(sx + ux * gap, sy + uy * gap);
        ctx.lineTo(x2 - ux * headLen, y2 - uy * headLen);
      } else {
        ctx.moveTo(x1 + ux * headLen, y1 + uy * headLen);
        ctx.lineTo(x2 - ux * headLen, y2 - uy * headLen);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowheads
      const drawHead = (hx, hy, dirx, diry) => {
        const px = -diry, py = dirx;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - dirx * headLen + px * headLen * 0.5, hy - diry * headLen + py * headLen * 0.5);
        ctx.lineTo(hx - dirx * headLen - px * headLen * 0.5, hy - diry * headLen - py * headLen * 0.5);
        ctx.closePath();
        ctx.fill();
      };
      drawHead(x1, y1, -ux, -uy);
      drawHead(x2, y2, ux, uy);

      // Asterisk at split point — 6-point star (3 lines at 60°)
      if (showSplit) {
        const r = 5;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI + Math.PI / 6;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          ctx.lineTo(sx - Math.cos(a) * r, sy - Math.sin(a) * r);
          ctx.stroke();
        }
      }

      // Labels — offset perpendicular to the line
      if (labels[0] || labels[1]) {
        ctx.fillStyle = this.alpha(labelColor, alpha);
        ctx.font = `italic ${labelSize}px ${FONT_MATH}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (labels[0]) {
          const mx = x1 + ux * len * splitT * 0.5 + nx * labelOffset;
          const my = y1 + uy * len * splitT * 0.5 + ny * labelOffset;
          ctx.fillText(labels[0], mx, my);
        }
        if (labels[1]) {
          const tMid = splitT + (1 - splitT) * 0.5;
          const mx = x1 + ux * len * tMid + nx * labelOffset;
          const my = y1 + uy * len * tMid + ny * labelOffset;
          ctx.fillText(labels[1], mx, my);
        }
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
      }
      ctx.restore();
    },

    // Filled rectangle with outline and an optional centered math label.
    // Alpha drives fill opacity (outline gets alpha too).
    region(ctx, x, y, rw, rh, opts = {}) {
      const {
        fill = "#83C167",
        stroke,
        fillAlpha = 0.55,
        alpha = 1,
        label,
        labelColor = VIZ_COLORS.fg,
        labelSize,
      } = opts;
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.fillStyle = this.alpha(fill, fillAlpha * alpha);
      ctx.fillRect(x, y, rw, rh);
      if (stroke !== null) {
        ctx.strokeStyle = this.alpha(stroke || fill, alpha);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, rw, rh);
      }
      if (label) {
        const size = labelSize || Math.max(12, Math.min(28, Math.min(rw, rh) * 0.32));
        ctx.fillStyle = this.alpha(labelColor, alpha);
        ctx.font = `italic ${size}px ${FONT_MATH}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + rw / 2, y + rh / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.restore();
    },

    // Draw a square/rect outline with the "trace in" effect — perimeter
    // reveal driven by progress p ∈ [0,1]. Starts at top-left corner.
    traceRect(ctx, x, y, rw, rh, p, opts = {}) {
      const { color = VIZ_COLORS.fg, width = 2, alpha = 1 } = opts;
      if (p <= 0) return;
      const perim = 2 * (rw + rh);
      const drawn = perim * Math.max(0, Math.min(1, p));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "square";
      ctx.beginPath();
      // edges: top (→), right (↓), bottom (←), left (↑)
      let remain = drawn;
      ctx.moveTo(x, y);
      const seg = (len, dx, dy, sx, sy) => {
        if (remain <= 0) return;
        const useLen = Math.min(remain, len);
        ctx.lineTo(sx + dx * useLen, sy + dy * useLen);
        remain -= useLen;
      };
      seg(rw, 1, 0, x, y);
      seg(rh, 0, 1, x + rw, y);
      seg(rw, -1, 0, x + rw, y + rh);
      seg(rh, 0, -1, x, y + rh);
      ctx.stroke();
      ctx.restore();
    },

    // Stagger helper: returns the fade value for the i-th item out of n,
    // where each item takes `dur` seconds (in t units) and they overlap by `overlap`.
    stagger(t, i, n, t0, perItem, overlap = 0.4) {
      const start = t0 + i * perItem * (1 - overlap);
      const end = start + perItem;
      return this.fade(t, start, end);
    },
  };
}

const HELPERS = buildHelpers();

// Compile a spec from JSON (Codex-generated) where `draw` and `setup` are strings.
// Preserves `_drawSource` (string) for the code panel + stage extraction.
function compileSpec(rawSpec) {
  if (!rawSpec) return null;
  const spec = { ...rawSpec };
  if (typeof spec.draw === "string") {
    spec._drawSource = spec.draw;
    try {
      // eslint-disable-next-line no-new-func
      spec.draw = new Function("ctx", "w", "h", "p", "t", "state", "H", spec.draw);
    } catch (err) {
      spec._compileError = `draw(): ${err.message}`;
      spec.draw = () => {};
    }
  } else if (typeof spec.draw === "function") {
    // preset specs ship a real function — capture its body for the code panel
    const fnStr = spec.draw.toString();
    const bodyMatch = fnStr.match(/\{([\s\S]*)\}\s*$/);
    spec._drawSource = bodyMatch ? bodyMatch[1].trim() : fnStr;
  }
  if (typeof spec.setup === "string") {
    spec._setupSource = spec.setup;
    try {
      // eslint-disable-next-line no-new-func
      spec.setup = new Function("state", "p", "w", "h", "H", spec.setup);
    } catch (err) {
      spec._compileError = (spec._compileError || "") + ` setup(): ${err.message}`;
      spec.setup = null;
    }
  } else if (typeof spec.setup === "function") {
    const fnStr = spec.setup.toString();
    const bodyMatch = fnStr.match(/\{([\s\S]*)\}\s*$/);
    spec._setupSource = bodyMatch ? bodyMatch[1].trim() : fnStr;
  }
  // Extract stage boundaries from H.fade(t, X, ...) calls in the source.
  // Optional explicit override: spec.stages = [{ t: 0.2, label: "..."}, ...]
  if (!Array.isArray(spec.stages)) {
    spec.stages = extractStages(spec._drawSource);
  }
  return spec;
}

// Find every `H.fade(t, X, ...)` literal in the source and return unique
// sorted X values as numbered stage chips. Filters out 0 and very-close pairs
// to keep the chip row readable.
function extractStages(src) {
  if (!src || typeof src !== "string") return [];
  const re = /H\.fade\s*\(\s*t\s*,\s*([0-9]*\.?[0-9]+)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const v = parseFloat(m[1]);
    if (!isFinite(v) || v < 0 || v > 1) continue;
    seen.add(Math.round(v * 1000) / 1000);
  }
  const all = [...seen].sort((a, b) => a - b);
  // Collapse points closer than 0.03
  const out = [];
  for (const v of all) {
    if (out.length === 0 || v - out[out.length - 1] > 0.03) out.push(v);
  }
  // Don't bother showing chips if there are fewer than 2 stages or more than 9
  if (out.length < 2 || out.length > 9) return [];
  return out.map((t, i) => ({ t, label: `${i + 1}` }));
}

// ============================================================
//  Main runtime component
// ============================================================
function VizRuntime({
  spec,
  fullscreen,
  onToggleFullscreen,
  accent,
  autoPlay = true,
  speed = 1,
  showAxes = true,
  mathFont = "serif",
  onRuntimeError,    // called once per spec when draw() throws
  onSaveSpec,        // edit-and-apply from the code panel
  onToggleSaveExample,
  isSavedExample = false,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const formulaRef = useRef(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const paramsRef = useRef(null);
  const redrawFnRef = useRef(null);
  const speedRef = useRef(speed);
  const runtimeErrorRef = useRef(false);   // dedupe — only call onRuntimeError once per spec
  const recordingRef = useRef(null);
  const helpersRef = useRef(null);
  const showAxesRef = useRef(showAxes);
  const saveNoticeTimerRef = useRef(null);

  // Build helpers per-render so tweak overrides (accent, mathFont) flow in.
  const helpers = useMemo(() => {
    const h = buildHelpers();
    h.COL = { ...VIZ_COLORS, accent: accent || VIZ_COLORS.teal };
    if (mathFont === "sans") {
      h.FONT_MATH = `"SF Pro Display", -apple-system, "Segoe UI", sans-serif`;
    } else if (mathFont === "mono") {
      h.FONT_MATH = `"SF Mono", "Fira Code", "Cascadia Code", monospace`;
    }
    return h;
  }, [accent, mathFont]);

  useEffect(() => { helpersRef.current = helpers; }, [helpers]);
  useEffect(() => { showAxesRef.current = showAxes; }, [showAxes]);

  const compiled = useMemo(() => compileSpec(spec), [spec]);

  const initialParams = useMemo(() => {
    const obj = {};
    (compiled?.params || []).forEach((p) => { obj[p.name] = p.default; });
    return obj;
  }, [compiled]);

  const [params, setParams] = useState(initialParams);
  const [playing, setPlaying] = useState(autoPlay);
  const [progress, setProgress] = useState(0);  // 0..1
  const [error, setError] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  // keep refs in sync so the RAF loop reads live values without re-subscribing
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // reset state + params when spec changes
  useEffect(() => {
    setParams(initialParams);
    stateRef.current = {};
    setProgress(0);
    progressRef.current = 0;
    setPlaying(autoPlay);
    setError(null);
    runtimeErrorRef.current = false;
  }, [compiled, initialParams, autoPlay]);

  // Render formula via KaTeX (unless spec wants its own canvas-rendered title)
  useEffect(() => {
    if (!formulaRef.current || !compiled?.formula || !window.katex) return;
    if (compiled.hideFormula) { formulaRef.current.innerHTML = ""; return; }
    try {
      window.katex.render(compiled.formula, formulaRef.current, {
        throwOnError: false,
        displayMode: false,
        macros: { "\\R": "\\mathbb{R}" },
      });
    } catch (e) {
      formulaRef.current.textContent = compiled.formula;
    }
  }, [compiled]);

  // Main render + RAF loop
  useEffect(() => {
    if (!compiled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const fitCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    const redraw = (t) => {
      const rect = canvas.getBoundingClientRect();
      try {
        stateRef.current.showAxes = showAxesRef.current;
        compiled.draw(ctx, rect.width, rect.height, paramsRef.current || initialParams, t, stateRef.current, helpersRef.current || helpers);
      } catch (e) {
        setError(`draw: ${e.message}`);
        if (!runtimeErrorRef.current && onRuntimeError) {
          runtimeErrorRef.current = true;
          onRuntimeError(e.message || String(e), t);
        }
      }
    };

    // Initial setup
    if (compiled.setup) {
      try {
        const rect = canvas.getBoundingClientRect();
        stateRef.current.showAxes = showAxesRef.current;
        compiled.setup(stateRef.current, paramsRef.current || initialParams, rect.width, rect.height, helpersRef.current || helpers);
      } catch (e) { setError(`setup: ${e.message}`); }
    }

    fitCanvas();
    redraw(progressRef.current);

    // ResizeObserver — refit + redraw on container size change
    const ro = new ResizeObserver(() => {
      if (fitCanvas()) redraw(progressRef.current);
    });
    ro.observe(canvas);

    // === Timing loop ===
    // Only start a ticker if the spec is actually animated. Static specs (duration=0)
    // get a single redraw and nothing else.
    let lastTs = performance.now();
    let intervalId = null;

    const tickStep = () => {
      const now = performance.now();
      const dt = Math.max(0, Math.min(100, now - lastTs)); // cap dt at 100ms
      lastTs = now;
      if (compiled.duration > 0 && playingRef.current) {
        let next = progressRef.current + (dt * speedRef.current) / compiled.duration;
        if (compiled.loop) next = next - Math.floor(next);
        else next = Math.min(1, Math.max(0, next));
        progressRef.current = next;
        setProgress(next);
        redraw(next);
      }
    };

    if (compiled.duration > 0) {
      intervalId = setInterval(tickStep, 16);
    }

    // Wake-up redraw when tab becomes visible again
    const onVis = () => {
      if (!document.hidden) {
        lastTs = performance.now();
        fitCanvas();
        redraw(progressRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // expose redraw for the param/scrub effect
    redrawFnRef.current = redraw;

    return () => {
      if (intervalId) clearInterval(intervalId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      redrawFnRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled]);

  // when params or scrub progress change while paused, redraw synchronously
  useEffect(() => {
    if (!compiled || !redrawFnRef.current) return;
    redrawFnRef.current(progressRef.current);
  }, [params, progress, compiled]);

  // when tweaks (accent / mathFont / showAxes) flip, redraw once with new helpers
  useEffect(() => {
    if (!compiled || !redrawFnRef.current) return;
    redrawFnRef.current(progressRef.current);
  }, [helpers, showAxes, compiled]);

  const togglePlay = useCallback(() => {
    if (!compiled || !compiled.duration) return;
    setPlaying((v) => !v);
  }, [compiled]);

  const scrub = useCallback((ratio) => {
    if (!compiled?.duration) return;
    setPlaying(false);
    const clamped = Math.max(0, Math.min(1, ratio));
    setProgress(clamped);
    progressRef.current = clamped;
  }, [compiled]);

  const restart = useCallback(() => {
    setProgress(0);
    progressRef.current = 0;
    setPlaying(true);
  }, []);

  const toggleSavedExample = useCallback(() => {
    if (!compiled || !onToggleSaveExample) return;
    onToggleSaveExample(compiled, params);
    setSaveNotice(isSavedExample ? "已从示例移除" : "已保存到示例");
    if (saveNoticeTimerRef.current) window.clearTimeout(saveNoticeTimerRef.current);
    saveNoticeTimerRef.current = window.setTimeout(() => setSaveNotice(""), 1400);
  }, [compiled, params, onToggleSaveExample, isSavedExample]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current) window.clearTimeout(saveNoticeTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts — space play/pause, R restart, ←/→ scrub by 5%, 1-9 jump to stage
  useEffect(() => {
    if (!compiled || !compiled.duration) return;
    const onKey = (e) => {
      // ignore when typing in an input/textarea
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); restart(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); scrub(Math.max(0, progressRef.current - 0.05)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); scrub(Math.min(1, progressRef.current + 0.05)); }
      else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const st = (compiled.stages || [])[idx];
        if (st) { e.preventDefault(); scrub(st.t); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compiled, togglePlay, restart, scrub]);

  if (!compiled) {
    return (
      <div className="viz">
        <div className="viz-header">
          <div className="viz-title">
            <span className="cat">Lumen</span>
            <h1>等待你的第一个数学问题</h1>
          </div>
        </div>
        <div className="viz-stage">
          <div className="viz-empty">
            <div className="glyph">∫</div>
            <h3>让公式发光</h3>
            <p>在左侧描述任意数学概念、公式或定理。Lumen 会理解你的需求，并在这里生成可交互的可视化。</p>
          </div>
        </div>
      </div>
    );
  }

  const dur = compiled.duration || 0;
  const tSec = (progress * dur) / 1000;
  const totalSec = dur / 1000;

  return (
    <div className={`viz ${fullscreen ? "fullscreen" : ""}`}>
      <div className="viz-header">
        <div className="viz-title">
          <span className="cat">{compiled.category || "Visualization"}</span>
          <h1>{compiled.title}</h1>
        </div>
        <div className="viz-actions">
          <button
            className="icon-btn"
            title="Restart (R)"
            onClick={restart}
            disabled={!dur}
          >
            <SvgIcon name="rotate-ccw" />
          </button>
          <button
            className={`icon-btn ${isSavedExample ? "active" : ""}`}
            aria-label={isSavedExample ? "从示例移除" : "保存到示例"}
            title={isSavedExample ? "已保存到示例（点击取消）" : "保存到示例"}
            onClick={toggleSavedExample}
          >
            <SvgIcon name={isSavedExample ? "bookmark-filled" : "bookmark"} />
          </button>
          <button
            className={`icon-btn ${showCode ? "active" : ""}`}
            title="查看 / 编辑代码"
            onClick={() => setShowCode((v) => !v)}
          >
            <SvgIcon name="code" />
          </button>
          <div className="export-wrap">
            <button
              className={`icon-btn ${exportMenu ? "active" : ""}`}
              title="导出"
              onClick={() => setExportMenu((v) => !v)}
            >
              <SvgIcon name="download" />
            </button>
            {exportMenu && (
              <ExportMenu
                canvasRef={canvasRef}
                spec={compiled}
                duration={dur}
                recording={recording}
                setRecording={setRecording}
                onClose={() => setExportMenu(false)}
              />
            )}
          </div>
          <button
            className="icon-btn"
            title="快捷键"
            onClick={() => setHelpOpen((v) => !v)}
          >
            <SvgIcon name="keyboard" />
          </button>
          <button
            className="icon-btn"
            title={fullscreen ? "退出全屏" : "全屏"}
            onClick={onToggleFullscreen}
          >
            <SvgIcon name={fullscreen ? "minimize" : "maximize"} />
          </button>
        </div>
        {saveNotice && <div className="viz-save-toast" role="status">{saveNotice}</div>}
      </div>

      <div className="viz-stage">
        <canvas ref={canvasRef} />
        {compiled.formula && compiled.hideFormula === false && (
          <div className="viz-formula" ref={formulaRef} />
        )}
        {recording && (
          <div className="recording-badge">
            <span className="dot" /> 正在录制
          </div>
        )}
        {error && <div className="viz-error">⚠ {error}</div>}
        {compiled._compileError && (
          <div className="viz-error">⚠ 编译错误：{compiled._compileError}</div>
        )}
        {helpOpen && (
          <div className="help-overlay" onClick={() => setHelpOpen(false)}>
            <div className="help-card" onClick={(e) => e.stopPropagation()}>
              <div className="help-head">
                <div className="title">快捷键</div>
                <button className="icon-btn" onClick={() => setHelpOpen(false)}>
                  <SvgIcon name="x" />
                </button>
              </div>
              <div className="help-rows">
                <div><kbd>Space</kbd> 播放 / 暂停</div>
                <div><kbd>R</kbd> 重新播放</div>
                <div><kbd>←</kbd> <kbd>→</kbd> 后退 / 前进 5%</div>
                <div><kbd>1</kbd> – <kbd>9</kbd> 跳到对应阶段</div>
              </div>
            </div>
          </div>
        )}
        {showCode && (
          <CodePanel
            spec={compiled}
            onClose={() => setShowCode(false)}
            onApply={(newDraw) => {
              if (onSaveSpec) onSaveSpec({ ...compiled, draw: newDraw });
            }}
          />
        )}
      </div>

      <div className="viz-controls">
        <button
          className="play-btn"
          onClick={togglePlay}
          disabled={!dur}
          title={dur ? (playing ? "暂停" : "播放") : "静态可视化"}
        >
          {dur ? (
            playing ? <SvgIcon name="pause" /> : <SvgIcon name="play" />
          ) : <SvgIcon name="circle" />}
        </button>
        <div className="timeline">
          <Scrub
            value={dur ? progress : 0}
            onChange={scrub}
            disabled={!dur}
            stages={dur ? (compiled.stages || []) : []}
            onStageClick={(t) => scrub(t)}
          />
          <div className="time">
            {dur
              ? `${tSec.toFixed(1)}s / ${totalSec.toFixed(1)}s`
              : "static"}
          </div>
        </div>
        <button
          className={`ctl-icon ${compiled.loop ? "active" : ""}`}
          title="循环"
          disabled
        >
          <SvgIcon name="repeat" />
        </button>
      </div>

      {!fullscreen && (
        <div className="viz-bottom">
          <div className="viz-explain">
            <div className="label">Explanation</div>
            <Explain text={compiled.explanation} />
          </div>
          <div className="viz-params">
            <div className="label">Parameters</div>
            {(compiled.params || []).length === 0 ? (
              <div className="viz-params-empty">No tunable parameters.</div>
            ) : (
              compiled.params.map((p) => (
                <ParamSlider
                  key={p.name}
                  param={p}
                  value={params[p.name]}
                  onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Export dropdown menu — PNG / WebM / Copy JSON
// ============================================================
function ExportMenu({ canvasRef, spec, duration, recording, setRecording, onClose }) {
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const handlePng = () => {
    exportPng(canvasRef.current, spec.title);
    onClose();
  };
  const handleWebm = async () => {
    if (recording) return;
    setRecording(true);
    setProgress(0);
    const r = await exportWebm(canvasRef.current, spec.title, duration, (p) => setProgress(p));
    setRecording(false);
    setProgress(0);
    if (!r.ok && r.error) alert(r.error);
    onClose();
  };
  const handleCopy = () => {
    if (copySpecToClipboard(spec)) {
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 900);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const onDown = (e) => {
      if (!e.target.closest(".export-wrap")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="export-menu">
      <button onClick={handlePng}>
        <SvgIcon name="download" /> 当前帧 PNG
      </button>
      <button onClick={handleWebm} disabled={!duration || recording}>
        <SvgIcon name="video" />
        {recording ? `录制中 ${Math.round(progress * 100)}%` : duration ? "完整动画 WebM" : "完整动画 WebM（静态图不支持）"}
      </button>
      <button onClick={handleCopy}>
        <SvgIcon name={copied ? "check" : "copy"} />
        {copied ? "已复制" : "复制 spec JSON"}
      </button>
    </div>
  );
}

// ============================================================
//  Code panel — view/edit the draw() body, with apply.
//  Slides over the canvas; clicking the canvas dims doesn't close.
// ============================================================
function CodePanel({ spec, onClose, onApply }) {
  const drawSrc = spec._drawSource || (typeof spec.draw === "function" ? spec.draw.toString() : "");
  const [src, setSrc] = useState(drawSrc);
  const [tab, setTab] = useState("draw");
  const [applied, setApplied] = useState(false);
  const dirty = src !== drawSrc;

  useEffect(() => {
    setSrc(spec._drawSource || (typeof spec.draw === "function" ? spec.draw.toString() : ""));
  }, [spec.id]);

  const apply = () => {
    if (onApply) onApply(src);
    setApplied(true);
    setTimeout(() => setApplied(false), 1200);
  };

  const specSummary = JSON.stringify({
    id: spec.id,
    title: spec.title,
    category: spec.category,
    formula: spec.formula,
    glyph: spec.glyph,
    hideFormula: spec.hideFormula,
    params: spec.params,
    duration: spec.duration,
    loop: spec.loop,
  }, null, 2);

  return (
    <div className="code-panel">
      <div className="code-head">
        <div className="code-tabs">
          <button
            className={tab === "draw" ? "active" : ""}
            onClick={() => setTab("draw")}
          >
            draw()
          </button>
          <button
            className={tab === "spec" ? "active" : ""}
            onClick={() => setTab("spec")}
          >
            spec JSON
          </button>
        </div>
        <div className="code-actions">
          {tab === "draw" && (
            <button
              className={`apply-btn ${applied ? "applied" : ""} ${dirty ? "dirty" : ""}`}
              onClick={apply}
              disabled={!dirty && !applied}
              title="重新编译并应用"
            >
              <SvgIcon name={applied ? "check" : "refresh"} />
              {applied ? "已应用" : "应用"}
            </button>
          )}
          <button
            className="icon-btn"
            title="复制"
            onClick={() => {
              navigator.clipboard.writeText(tab === "draw" ? src : specSummary);
            }}
          >
            <SvgIcon name="copy" />
          </button>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <SvgIcon name="x" />
          </button>
        </div>
      </div>
      {tab === "draw" ? (
        <textarea
          className="code-body"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          spellCheck={false}
        />
      ) : (
        <pre className="code-body code-readonly">{specSummary}</pre>
      )}
      <div className="code-footer">
        <span>
          签名：<code>draw(ctx, w, h, p, t, state, H)</code>
        </span>
        <span className="hint">编辑后点应用 / Cmd-Enter</span>
      </div>
    </div>
  );
}

// ============================================================
//  Scrubber — also renders stage markers if provided
// ============================================================
function Scrub({ value, onChange, disabled, stages = [], onStageClick }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const handle = (e) => {
    if (disabled) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    onChange(Math.max(0, Math.min(1, x / r.width)));
  };
  return (
    <div
      ref={ref}
      className="scrub"
      onMouseDown={(e) => { dragging.current = true; handle(e); }}
      onMouseMove={(e) => dragging.current && handle(e)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      style={disabled ? { opacity: 0.4, cursor: "default" } : {}}
    >
      <div className="scrub-fill" style={{ width: `${value * 100}%` }} />
      {stages.map((s, i) => (
        <button
          key={i}
          className={`stage-marker ${value >= s.t - 0.01 ? "passed" : ""}`}
          style={{ left: `${s.t * 100}%` }}
          title={`阶段 ${s.label}`}
          onClick={(e) => {
            e.stopPropagation();
            dragging.current = false;
            if (onStageClick) onStageClick(s.t);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span>{s.label}</span>
        </button>
      ))}
      <div className="scrub-thumb" style={{ left: `${value * 100}%` }} />
    </div>
  );
}

// ============================================================
//  Parameter slider
// ============================================================
function ParamSlider({ param, value, onChange }) {
  return (
    <div className="param-row">
      <div className="row1">
        <div className="name">
          <span className="var">{param.label || param.name}</span>
        </div>
        <div className="value">{formatVal(value, param.step)}</div>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value ?? param.default}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
function formatVal(v, step) {
  if (v == null) return "—";
  if (step >= 1) return `${Math.round(v)}`;
  if (step >= 0.1) return v.toFixed(1);
  if (step >= 0.01) return v.toFixed(2);
  return v.toFixed(3);
}

// ============================================================
//  Explanation: tiny markdown + LaTeX renderer
//  Supports: paragraphs, **bold**, $inline$ / $$display$$
// ============================================================
function Explain({ text }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = renderMarkdownMath(text || "");
    // typeset katex spans
    if (window.renderMathInElement) {
      window.renderMathInElement(ref.current, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }, [text]);
  return <div className="explain-body" ref={ref} />;
}

function renderMarkdownMath(src) {
  // escape html
  let s = src.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // paragraphs
  const blocks = s.split(/\n\s*\n/).map((b) => `<p>${b.replace(/\n/g, " ")}</p>`).join("");
  // bold (avoid math by skipping inside dollar) — naive: handle after KaTeX would clobber, so do simple regex
  return blocks.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// ============================================================
//  PNG export
// ============================================================
function exportPng(canvas, title) {
  if (!canvas) return;
  // Add a background since canvas is transparent
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const c = tmp.getContext("2d");
  c.fillStyle = "#0A0E14";
  c.fillRect(0, 0, tmp.width, tmp.height);
  c.drawImage(canvas, 0, 0);
  tmp.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "viz").replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// ============================================================
//  WebM export — records the canvas via MediaRecorder for one loop.
//  Returns a Promise<{ ok, error }>. onProgress(0..1) reports recording progress.
// ============================================================
function exportWebm(canvas, title, durationMs, onProgress) {
  return new Promise((resolve) => {
    if (!canvas || !durationMs) {
      resolve({ ok: false, error: "无可录制的动画（静态图）" });
      return;
    }
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      resolve({ ok: false, error: "当前浏览器不支持 MediaRecorder。建议改用 PNG 导出。" });
      return;
    }
    try {
      // Composite onto a background canvas so the recording isn't transparent.
      const bg = document.createElement("canvas");
      bg.width = canvas.width;
      bg.height = canvas.height;
      const bctx = bg.getContext("2d");
      let stopped = false;

      const stream = bg.captureStream(30);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(title || "viz").replace(/\s+/g, "-")}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve({ ok: true });
      };

      // Composite loop @ 30 fps
      const startTs = performance.now();
      const total = Math.min(durationMs, 30_000); // cap at 30s to keep file sane
      const tick = () => {
        if (stopped) return;
        const elapsed = performance.now() - startTs;
        bctx.fillStyle = "#0A0E14";
        bctx.fillRect(0, 0, bg.width, bg.height);
        bctx.drawImage(canvas, 0, 0);
        if (onProgress) onProgress(Math.min(1, elapsed / total));
        if (elapsed >= total) {
          stopped = true;
          rec.stop();
          stream.getTracks().forEach((t) => t.stop());
        } else {
          requestAnimationFrame(tick);
        }
      };
      rec.start(100);
      tick();
    } catch (err) {
      resolve({ ok: false, error: err.message || String(err) });
    }
  });
}

// Copy the spec (JSON shape) to clipboard. Strips internal fields.
function copySpecToClipboard(spec) {
  if (!spec) return false;
  const out = {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    formula: spec.formula,
    glyph: spec.glyph,
    hideFormula: spec.hideFormula,
    intro: spec.intro,
    explanation: spec.explanation,
    params: spec.params,
    duration: spec.duration,
    loop: spec.loop,
    draw: spec._drawSource || (typeof spec.draw === "function" ? spec.draw.toString() : spec.draw),
  };
  try {
    navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================
//  Tiny icon set
// ============================================================
function SvgIcon({ name }) {
  const paths = {
    play: <polygon points="6 4 18 12 6 20 6 4" fill="currentColor" stroke="none" />,
    pause: <><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" /></>,
    circle: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
    "rotate-ccw": <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    maximize: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
    minimize: <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>,
    repeat: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
    sparkles: <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />,
    message: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    chevron: <polyline points="9 6 15 12 9 18" />,
    code: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M8 14h8" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    sliders: <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
    compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" /></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
    "bookmark-filled": <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// expose
window.VizRuntime = VizRuntime;
window.VIZ_HELPERS = HELPERS;
window.compileSpec = compileSpec;
window.SvgIcon = SvgIcon;
