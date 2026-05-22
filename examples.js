// Preset visualizations — each is a complete "spec" the VizRuntime can render.
// The same shape Codex will generate.
//
// Shape:
//   id, title, category, formula (LaTeX), explanation (markdown w/ $...$ allowed),
//   params: [{ name, label, min, max, step, default }],
//   duration: ms (set 0 for non-looping static),
//   loop: bool,
//   setup(state, params, w, h): optional initialization
//   draw(ctx, w, h, params, t, state, helpers): mandatory; t is 0..1

window.VIZ_EXAMPLES = [
  // ============================================================
  //  0. (a+b)² — manim-style staged geometric proof
  // ============================================================
  {
    id: "binomial-square",
    title: "完全平方公式 · 面积证明",
    category: "Algebra · Geometry",
    formula: "(a+b)^2 = a^2 + b^2 + 2ab",
    glyph: "□",
    hideFormula: true,  // we render our own colored-term title in canvas
    explanation:
      "**面积证明**：边长为 $a+b$ 的正方形可以切成四块——左下是 $a \\times a$、右上是 $b \\times b$、其余两块都是 $a \\times b$。\n\n各部分面积相加：$a^2 + b^2 + ab + ab = a^2 + b^2 + 2ab$，正好等于大正方形面积 $(a+b)^2$。",
    params: [
      { name: "a", label: "a", min: 0.4, max: 2.5, step: 0.05, default: 1.0 },
      { name: "b", label: "b", min: 0.4, max: 2.5, step: 0.05, default: 1.8 },
    ],
    duration: 11000,
    loop: true,
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);

      // --- Stage timings ---
      const sqIn   = H.fade(t, 0.00, 0.12);        // square outline traces in
      const brkIn  = H.fade(t, 0.10, 0.22);        // dimension brackets fade in
      const aIn    = H.fade(t, 0.24, 0.36);        // a² region
      const bIn    = H.fade(t, 0.42, 0.54);        // b² region
      const ab1In  = H.fade(t, 0.60, 0.72);        // top-left ab
      const ab2In  = H.fade(t, 0.78, 0.90);        // bottom-right ab
      const formA  = H.fade(t, 0.24, 0.36);
      const formB  = H.fade(t, 0.42, 0.54);
      const form2ab= H.fade(t, 0.60, 0.90);

      // --- Layout ---
      const a = p.a, b = p.b;
      const titleY = 70;
      const padLeftForBracket = 90;
      const padBottomForBracket = 70;
      const padTop = titleY + 60;
      const padRight = 40;
      const availW = w - padLeftForBracket - padRight;
      const availH = h - padTop - padBottomForBracket;
      const total = a + b;
      const scale = Math.min(availW, availH) / total;
      const sqSize = total * scale;
      const sa = a * scale, sb = b * scale;
      const x0 = padLeftForBracket + (availW - sqSize) / 2;
      const y0 = padTop + (availH - sqSize) / 2;

      // --- Colors (manim/3B1B palette) ---
      const C_GREEN  = "#83C167";
      const C_GREEN_FILL = "#5C7B3D";
      const C_BROWN  = "#F0A95F";  // outline accent
      const C_BROWN_FILL = "#8B4513";
      const C_YELLOW = "#FFD24C";
      const C_YELLOW_FILL = "#8B8B2F";

      // --- Title: colored-term formula ---
      H.formula(ctx, [
        { text: "(a + b)", color: H.COL.fg },
        { text: "²", color: H.COL.fg, weight: "bold" },
        { text: " = ", color: H.COL.fg, italic: false },
        { text: "a²", color: H.alpha(C_GREEN, formA) },
        { text: " + ", color: H.alpha(H.COL.fg, formB), italic: false },
        { text: "b²", color: H.alpha(C_BROWN, formB) },
        { text: " + ", color: H.alpha(H.COL.fg, form2ab), italic: false },
        { text: "2ab", color: H.alpha(C_YELLOW, form2ab), weight: "bold" },
      ], w / 2, titleY, { size: 32 });

      // --- Square outline (trace in) ---
      H.traceRect(ctx, x0, y0, sqSize, sqSize, sqIn, { color: H.COL.fg, width: 2 });

      // --- Dimension brackets ---
      if (brkIn > 0.01) {
        const off = 26;
        // Left vertical bracket — top portion b, bottom portion a
        H.dimBracket(
          ctx,
          x0 - off, y0,
          x0 - off, y0 + sqSize,
          {
            color: H.COL.coral,
            labels: ["b", "a"],
            splitT: sb / sqSize,
            alpha: brkIn,
            labelSide: +1,           // labels to the LEFT of the bracket
            labelOffset: 20,
            labelSize: 22,
            labelColor: H.COL.fg,
          }
        );
        // Bottom horizontal bracket — left portion a, right portion b
        H.dimBracket(
          ctx,
          x0, y0 + sqSize + off,
          x0 + sqSize, y0 + sqSize + off,
          {
            color: H.COL.coral,
            labels: ["a", "b"],
            splitT: sa / sqSize,
            alpha: brkIn,
            labelSide: +1,           // labels BELOW (perpendicular)
            labelOffset: 22,
            labelSize: 22,
            labelColor: H.COL.fg,
          }
        );
      }

      // --- a² region (bottom-left, side sa) ---
      H.region(ctx, x0, y0 + sb, sa, sa, {
        fill: C_GREEN_FILL,
        stroke: C_GREEN,
        fillAlpha: 0.85,
        alpha: aIn,
        label: "a²",
        labelColor: H.COL.fg,
      });

      // --- b² region (top-right, side sb) ---
      H.region(ctx, x0 + sa, y0, sb, sb, {
        fill: C_BROWN_FILL,
        stroke: C_BROWN,
        fillAlpha: 0.85,
        alpha: bIn,
        label: "b²",
        labelColor: H.COL.fg,
      });

      // --- ab top-left (width sa, height sb) ---
      H.region(ctx, x0, y0, sa, sb, {
        fill: C_YELLOW_FILL,
        stroke: C_YELLOW,
        fillAlpha: 0.85,
        alpha: ab1In,
        label: "ab",
        labelColor: H.COL.fg,
      });

      // --- ab bottom-right (width sb, height sa) ---
      H.region(ctx, x0 + sa, y0 + sb, sb, sa, {
        fill: C_YELLOW_FILL,
        stroke: C_YELLOW,
        fillAlpha: 0.85,
        alpha: ab2In,
        label: "ab",
        labelColor: H.COL.fg,
      });
    },
  },

  // ============================================================
  //  1. Euler's Identity — rotating vector on unit circle
  // ============================================================
  {
    id: "euler",
    title: "欧拉公式",
    category: "Complex Analysis",
    formula: "e^{i\\theta} = \\cos\\theta + i\\sin\\theta",
    explanation:
      "**欧拉公式**把指数函数与三角函数统一在复平面上。把 $\\theta$ 从 $0$ 推到 $2\\pi$，向量 $e^{i\\theta}$ 沿单位圆运动。\n\n当 $\\theta = \\pi$ 时，$e^{i\\pi} = -1$，于是有最美的等式：$e^{i\\pi} + 1 = 0$。",
    params: [
      { name: "theta", label: "θ / π", min: 0, max: 2, step: 0.01, default: 0.5 },
      { name: "showTrace", label: "show trace", min: 0, max: 1, step: 1, default: 1 },
    ],
    duration: 6000,
    loop: true,
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.34;

      // If slider is at the default-ish 0.5, let time drive theta.
      // If user moved it, the slider drives.
      const sliderTouched = Math.abs(p.theta - 0.5) > 0.02;
      const theta = sliderTouched
        ? (p.theta * Math.PI) % (Math.PI * 2)
        : (t * Math.PI * 2);

      H.axes(ctx, cx, cy, R * 1.5, R * 1.5);

      // Unit circle
      H.circle(ctx, cx, cy, R, { stroke: H.COL.dim, width: 1.5 });

      // Reference: real and imag projections
      const x = cx + R * Math.cos(theta);
      const y = cy - R * Math.sin(theta);

      // Trace arc from 0 to theta
      if (p.showTrace > 0.5) {
        ctx.strokeStyle = H.COL.teal;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, -theta, true);
        ctx.stroke();
      }

      // cos and sin projection lines
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = H.COL.yellow;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, cy); ctx.stroke();
      ctx.strokeStyle = H.COL.red;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, y); ctx.stroke();
      ctx.setLineDash([]);

      // The vector itself
      H.arrow(ctx, cx, cy, x, y, { stroke: H.COL.blue, width: 2.5, head: 10 });

      // Point
      H.dot(ctx, x, y, 5, H.COL.blue);

      // Labels
      ctx.fillStyle = H.COL.yellow;
      ctx.font = `italic 14px ${H.FONT_MATH}`;
      ctx.fillText(`cos θ = ${Math.cos(theta).toFixed(2)}`, x + 6, (y + cy) / 2);
      ctx.fillStyle = H.COL.red;
      ctx.fillText(`sin θ = ${Math.sin(theta).toFixed(2)}`, (x + cx) / 2 - 30, y - 6);

      // theta arc near origin
      ctx.strokeStyle = H.COL.purple;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.18, 0, -theta, true);
      ctx.stroke();
      ctx.fillStyle = H.COL.purple;
      ctx.font = `italic 14px ${H.FONT_MATH}`;
      ctx.fillText("θ", cx + R * 0.22, cy - R * 0.05);

      // Big formula bottom
      ctx.fillStyle = H.COL.fg;
      ctx.font = `italic 18px ${H.FONT_MATH}`;
      ctx.textAlign = "center";
      ctx.fillText(
        `e^(iθ) = ${Math.cos(theta).toFixed(2)} + ${Math.sin(theta).toFixed(2)} i`,
        cx, h - 30
      );
      ctx.textAlign = "left";
    },
  },


  // ============================================================
  //  2. Fourier square wave — stage-built harmonic by harmonic
  // ============================================================
  {
    id: "fourier-square",
    title: "傅里叶级数 · 方波",
    category: "Fourier Analysis",
    formula: "f(x) = \\frac{4}{\\pi} \\sum_{n=1,3,5,\\ldots}^{N} \\frac{\\sin(nx)}{n}",
    glyph: "Σ",
    hideFormula: true,
    explanation:
      "任意周期函数都可以写成正弦的无穷叠加。从最低频开始**逐次加入**奇次谐波，叠加曲线一步步逼近方波。\n\n角处仍有约 $9\\%$ 的过冲——这就是著名的 **Gibbs 现象**。",
    params: [
      { name: "N", label: "最大谐波", min: 1, max: 21, step: 2, default: 9 },
    ],
    duration: 11000,
    loop: true,
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);
      const titleY = 60;
      const padL = 70, padR = 40, padT = 100, padB = 60;
      const gw = w - padL - padR, gh = h - padT - padB;
      const cx0 = padL, cy0 = padT + gh / 2;
      const xScale = gw / (Math.PI * 4);
      const yScale = gh / 3;

      // === stages ===
      const axesIn = H.fade(t, 0.00, 0.10);
      const refIn  = H.fade(t, 0.08, 0.20);

      const N = Math.max(1, Math.floor(p.N) | 1);
      const total = (N + 1) / 2;
      const harm = [];
      for (let i = 0; i < total; i++) {
        const n = 2 * i + 1;
        const startT = 0.20 + (i / total) * 0.70;
        const a = H.fade(t, startT, startT + 0.10);
        harm.push({ n, a });
      }

      // === axes ===
      ctx.globalAlpha = axesIn;
      H.axes(ctx, cx0 + gw / 2, cy0, gw, gh);
      ctx.globalAlpha = 1;

      // === reference ghost square wave ===
      if (refIn > 0.01) {
        ctx.strokeStyle = H.alpha(H.COL.dim, refIn);
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) {
          const x1 = cx0 + gw / 2 + i * Math.PI * xScale;
          const x2 = cx0 + gw / 2 + (i + 1) * Math.PI * xScale;
          const yy = cy0 - (i % 2 === 0 ? 1 : -1) * yScale;
          ctx.moveTo(x1, yy); ctx.lineTo(x2, yy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // === individual harmonics (faded) ===
      harm.forEach((H_) => {
        if (H_.a < 0.02) return;
        ctx.beginPath();
        ctx.strokeStyle = H.alpha(H.COL.teal, 0.32 * H_.a);
        ctx.lineWidth = 1.2;
        for (let px = 0; px <= gw; px += 1) {
          const x = (px - gw / 2) / xScale;
          const y = (4 / Math.PI) * Math.sin(H_.n * x) / H_.n;
          const sx = cx0 + px, sy = cy0 - y * yScale;
          if (px === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      });

      // === partial sum (each harmonic weighted by its alpha so the curve "grows" smoothly) ===
      ctx.beginPath();
      ctx.strokeStyle = H.COL.blue;
      ctx.lineWidth = 3;
      for (let px = 0; px <= gw; px += 1) {
        const x = (px - gw / 2) / xScale;
        let y = 0;
        for (const H_ of harm) y += H_.a * Math.sin(H_.n * x) / H_.n;
        y *= 4 / Math.PI;
        const sx = cx0 + px, sy = cy0 - y * yScale;
        if (px === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // === x-axis labels ===
      ctx.fillStyle = H.alpha(H.COL.muted, axesIn);
      ctx.font = `italic 13px ${H.FONT_MATH}`;
      ctx.textAlign = "center";
      ["−2π", "−π", "0", "π", "2π"].forEach((lbl, i) => {
        ctx.fillText(lbl, cx0 + (i / 4) * gw, cy0 + 24);
      });
      ctx.textAlign = "left";

      // === title: f(x) = (4/π) · [ sin(x)/1 + sin(3x)/3 + ... ]
      //     each harmonic term + its preceding "+" fade in together with the curve ===
      const segs = [
        { text: "f(x) = ", italic: false, color: H.alpha(H.COL.fg, axesIn) },
        { text: "4", color: H.alpha(H.COL.fg, axesIn) },
        { text: "/", italic: false, color: H.alpha(H.COL.fg, axesIn) },
        { text: "π", color: H.alpha(H.COL.fg, axesIn) },
        { text: " · ", italic: false, color: H.alpha(H.COL.muted, axesIn) },
      ];
      harm.forEach((H_, i) => {
        if (i > 0) segs.push({ text: " + ", italic: false, color: H.alpha(H.COL.muted, H_.a) });
        segs.push({ text: `sin(${H_.n}x)/${H_.n}`, color: H.alpha(H.COL.blue, H_.a) });
      });
      H.formula(ctx, segs, w / 2, titleY, { size: 22 });
    },
  },

  // ============================================================
  //  3. Taylor series of sin x — term by term
  // ============================================================
  {
    id: "taylor-sin",
    title: "泰勒展开 · sin x",
    category: "Calculus",
    formula: "\\sin x = x - \\frac{x^3}{3!} + \\frac{x^5}{5!} - \\frac{x^7}{7!} + \\cdots",
    glyph: "ƒ",
    hideFormula: true,
    explanation:
      "**泰勒级数**用多项式逼近光滑函数。每多加一项，逼近的范围就向外扩张一些。\n\n注意远离原点处误差仍会爆炸——这是局部展开的本性。",
    params: [
      { name: "K", label: "项数", min: 1, max: 9, step: 1, default: 6 },
    ],
    duration: 12000,
    loop: true,
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);
      const titleY = 60;
      const padL = 60, padR = 40, padT = 110, padB = 60;
      const gw = w - padL - padR, gh = h - padT - padB;
      const cx = padL + gw / 2, cy = padT + gh / 2;
      const xSpan = Math.PI * 2.5;
      const xScale = (gw / 2) / xSpan;
      const yScale = gh / 5;

      const axesIn = H.fade(t, 0.00, 0.10);
      const sinIn  = H.fade(t, 0.06, 0.20);

      // Axes
      ctx.globalAlpha = axesIn;
      H.axes(ctx, cx, cy, gw, gh);
      ctx.globalAlpha = 1;

      // Tick labels
      ctx.fillStyle = H.alpha(H.COL.muted, axesIn);
      ctx.font = `italic 13px ${H.FONT_MATH}`;
      ctx.textAlign = "center";
      [-2, -1, 1, 2].forEach((m) => {
        ctx.fillText(`${m < 0 ? "−" : ""}${Math.abs(m) === 1 ? "" : Math.abs(m)}π`, cx + m * Math.PI * xScale, cy + 22);
      });
      ctx.textAlign = "left";

      // === Reference sin(x) — dashed ===
      ctx.strokeStyle = H.alpha(H.COL.fg, 0.5 * sinIn);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (let px = 0; px <= gw; px += 1) {
        const x = (px - gw / 2) / xScale;
        const y = Math.sin(x);
        const sx = padL + px, sy = cy - y * yScale;
        if (px === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // === Build terms ===
      const K = Math.max(1, Math.floor(p.K));
      const terms = [];
      for (let k = 0; k < K; k++) {
        const n = 2 * k + 1;
        let fact = 1;
        for (let i = 2; i <= n; i++) fact *= i;
        const c = ((k % 2 === 0) ? 1 : -1) / fact;
        const startT = 0.22 + (k / K) * 0.72;
        const a = H.fade(t, startT, startT + 0.10);
        terms.push({ n, c, a, k });
      }

      // === Taylor polynomial — each term weighted by its alpha ===
      ctx.beginPath();
      ctx.strokeStyle = H.COL.yellow;
      ctx.lineWidth = 3;
      let started = false;
      for (let px = 0; px <= gw; px += 1) {
        const x = (px - gw / 2) / xScale;
        let y = 0;
        for (const T of terms) y += T.a * T.c * Math.pow(x, T.n);
        const sy = cy - y * yScale;
        if (sy < padT - 80 || sy > padT + gh + 80) { started = false; continue; }
        const sx = padL + px;
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // === Title: sin x = x − x³/6 + x⁵/120 − ... ===
      // Each term + its leading sign fade in together with the corresponding curve update.
      const segs = [
        { text: "sin x", color: H.alpha(H.COL.fg, 0.6 + 0.4 * sinIn) },
        { text: " = ", italic: false, color: H.alpha(H.COL.fg, sinIn) },
      ];
      terms.forEach((T, i) => {
        const sign = i === 0 ? "" : (i % 2 === 0 ? " + " : " − ");
        if (i > 0) segs.push({ text: sign, italic: false, color: H.alpha(H.COL.muted, T.a) });
        const body = T.n === 1 ? "x" : `x${supDigit(T.n)}/${T.n}!`;
        segs.push({ text: body, color: H.alpha(H.COL.yellow, T.a) });
      });
      H.formula(ctx, segs, w / 2, titleY, { size: 22 });

      // local sup-digit helper
      function supDigit(n) {
        const map = ["⁰","¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹"];
        return n.toString().split("").map(d => map[+d]).join("");
      }
    },
  },

  // ============================================================
  //  4. Pythagoras — squares grow from each side, then the sum
  // ============================================================
  {
    id: "pythagoras",
    title: "勾股定理 · 几何证明",
    category: "Geometry",
    formula: "a^2 + b^2 = c^2",
    glyph: "△",
    hideFormula: true,
    explanation:
      "**勾股定理**：直角三角形两直角边的平方和等于斜边的平方。\n\n三个正方形分别长在三条边外侧，蓝色和黄色加起来等于红色——面积守恒就是定理本身。",
    params: [
      { name: "a", label: "a", min: 1, max: 5, step: 0.1, default: 3 },
      { name: "b", label: "b", min: 1, max: 5, step: 0.1, default: 4 },
    ],
    duration: 11000,
    loop: true,
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);
      const titleY = 60;
      const a = p.a, b = p.b;
      const c = Math.sqrt(a * a + b * b);
      const totalSize = a + b + c + 2.5;
      const scale = Math.min(w * 0.72, (h - 200) * 0.72) / totalSize;
      const cx = w / 2, cy = (h + 80) / 2;
      const sa = a * scale, sb = b * scale, sc = c * scale;

      // Triangle vertices (V1 = right-angle corner)
      const V1 = { x: cx - sb / 2, y: cy + sa / 2 };
      const V2 = { x: V1.x + sb, y: V1.y };
      const V3 = { x: V1.x, y: V1.y - sa };

      const triIn  = H.fade(t, 0.00, 0.14);
      const labIn  = H.fade(t, 0.13, 0.24);
      const sqAIn  = H.fade(t, 0.25, 0.42);
      const sqBIn  = H.fade(t, 0.43, 0.60);
      const sqCIn  = H.fade(t, 0.61, 0.80);
      const eqIn   = H.fade(t, 0.82, 0.95);

      // === Square on side a (left of V1-V3, grows leftward) ===
      if (sqAIn > 0.01) {
        const s = H.easeOutCubic(sqAIn);
        const x0 = V1.x - sa * s;
        const y0 = V3.y;
        H.region(ctx, x0, y0, sa * s, sa, {
          fill: "#2B6F7A", stroke: H.COL.blue,
          fillAlpha: 0.7, alpha: 1,
          label: sqAIn > 0.7 ? `a² = ${(a * a).toFixed(1)}` : "",
          labelColor: H.COL.fg, labelSize: 16,
        });
      }

      // === Square on side b (below V1-V2, grows downward) ===
      if (sqBIn > 0.01) {
        const s = H.easeOutCubic(sqBIn);
        H.region(ctx, V1.x, V1.y, sb, sb * s, {
          fill: "#8B8B2F", stroke: H.COL.yellow,
          fillAlpha: 0.7, alpha: 1,
          label: sqBIn > 0.7 ? `b² = ${(b * b).toFixed(1)}` : "",
          labelColor: H.COL.fg, labelSize: 16,
        });
      }

      // === Square on side c (outer side of hypotenuse V3->V2, grows outward) ===
      if (sqCIn > 0.01) {
        const s = H.easeOutCubic(sqCIn);
        const hx = V2.x - V3.x, hy = V2.y - V3.y;
        const len = Math.hypot(hx, hy);
        const nx = hy / len, ny = -hx / len;
        const Hp1 = V3, Hp2 = V2;
        const Hp3 = { x: V2.x + nx * sc * s, y: V2.y + ny * sc * s };
        const Hp4 = { x: V3.x + nx * sc * s, y: V3.y + ny * sc * s };
        ctx.fillStyle = H.alpha("#7A2622", 0.7);
        ctx.strokeStyle = H.alpha(H.COL.red, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Hp1.x, Hp1.y); ctx.lineTo(Hp2.x, Hp2.y);
        ctx.lineTo(Hp3.x, Hp3.y); ctx.lineTo(Hp4.x, Hp4.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (sqCIn > 0.7) {
          const cxLbl = (Hp1.x + Hp3.x) / 2, cyLbl = (Hp1.y + Hp3.y) / 2;
          ctx.fillStyle = H.COL.fg;
          ctx.font = `italic 16px ${H.FONT_MATH}`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(`c² = ${(c * c).toFixed(1)}`, cxLbl, cyLbl);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        }
      }

      // === Triangle (on top of the squares) ===
      if (triIn > 0.01) {
        ctx.save();
        ctx.globalAlpha = triIn;
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.strokeStyle = H.COL.fg;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(V1.x, V1.y); ctx.lineTo(V2.x, V2.y); ctx.lineTo(V3.x, V3.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // right-angle marker
        const m = 10;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(V1.x + m, V1.y); ctx.lineTo(V1.x + m, V1.y - m); ctx.lineTo(V1.x, V1.y - m);
        ctx.stroke();
        ctx.restore();
      }

      // === Side labels (a, b, c) ===
      if (labIn > 0.01) {
        ctx.save();
        ctx.globalAlpha = labIn;
        ctx.fillStyle = H.COL.fg;
        ctx.font = `italic 18px ${H.FONT_MATH}`;
        ctx.textAlign = "center";
        ctx.fillText("a", V1.x - 14, (V1.y + V3.y) / 2 + 6);
        ctx.fillText("b", (V1.x + V2.x) / 2, V1.y + 22);
        ctx.fillText("c", (V2.x + V3.x) / 2 + 12, (V2.y + V3.y) / 2 - 8);
        ctx.textAlign = "left";
        ctx.restore();
      }

      // === Title formula with colored terms — each term + its operator
      //     fades in only when its square appears on screen ===
      const aOn = sqAIn, bOn = sqBIn, cOn = sqCIn;
      H.formula(ctx, [
        { text: "a²", color: H.alpha(H.COL.blue, aOn) },
        { text: " + ", italic: false, color: H.alpha(H.COL.fg, bOn) },
        { text: "b²", color: H.alpha(H.COL.yellow, bOn) },
        { text: " = ", italic: false, color: H.alpha(H.COL.fg, cOn) },
        { text: "c²", color: H.alpha(H.COL.red, cOn) },
      ], w / 2, titleY, { size: 32 });

      // === Numeric equation at bottom (after all squares drawn) ===
      if (eqIn > 0.01) {
        H.formula(ctx, [
          { text: `${(a * a).toFixed(1)}`, color: H.alpha(H.COL.blue, eqIn) },
          { text: " + ", italic: false, color: H.alpha(H.COL.fg, eqIn) },
          { text: `${(b * b).toFixed(1)}`, color: H.alpha(H.COL.yellow, eqIn) },
          { text: " = ", italic: false, color: H.alpha(H.COL.fg, eqIn) },
          { text: `${(c * c).toFixed(1)}`, color: H.alpha(H.COL.red, eqIn) },
        ], w / 2, h - 30, { size: 22 });
      }
    },
  },

  // ============================================================
  //  5. Normal distribution — samples drop into histogram
  // ============================================================
  {
    id: "normal",
    title: "正态分布 · 中心极限",
    category: "Probability",
    formula: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}",
    glyph: "σ",
    hideFormula: true,
    explanation:
      "**正态分布**由均值 $\\mu$ 和标准差 $\\sigma$ 完全决定。\n\n动画里 $N$ 个独立样本依次落入直方图，随着 $N \\to \\infty$，离散柱状图收敛到光滑的钟形曲线 $f(x)$。",
    params: [
      { name: "mu",    label: "μ", min: -2, max: 2, step: 0.1, default: 0 },
      { name: "sigma", label: "σ", min: 0.4, max: 2.5, step: 0.05, default: 1 },
    ],
    duration: 13000,
    loop: true,
    setup(state, p, w, h, H) {
      // deterministic standard-normal samples via Box-Muller
      // simple seeded LCG so re-runs match across redraws
      let s = 0x2F6E2B1;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
      state.samples = [];
      for (let i = 0; i < 320; i++) {
        const u1 = Math.max(1e-9, rnd());
        const u2 = rnd();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        state.samples.push({ z, delay: i / 320 });
      }
    },
    draw(ctx, w, h, p, t, state, H) {
      H.clear(ctx, w, h);
      const titleY = 60;
      const padL = 60, padR = 40, padT = 110, padB = 70;
      const gw = w - padL - padR, gh = h - padT - padB;
      const cy0 = padT + gh - 10;
      const xMin = -5, xMax = 5;
      const xScale = gw / (xMax - xMin);
      const yMax = 0.5;
      const yScale = (gh - 20) / yMax;
      const xToPx = (x) => padL + (x - xMin) * xScale;
      const yToPy = (y) => cy0 - y * yScale;

      const mu = p.mu, sigma = p.sigma;
      const pdf = (x) => (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

      // === stages ===
      const axesIn   = H.fade(t, 0.00, 0.10);
      const dropProg = H.fade(t, 0.10, 0.78);
      const curveIn  = H.fade(t, 0.78, 0.90);
      const sigIn    = H.fade(t, 0.90, 0.98);

      // axes
      ctx.globalAlpha = axesIn;
      H.axes(ctx, padL + gw / 2, cy0, gw, gh);
      ctx.globalAlpha = 1;

      // === histogram bars ===
      const samples = (state && state.samples) ? state.samples : [];
      const visibleN = samples.filter(s => s.delay <= dropProg).length;
      if (visibleN > 0) {
        const numBins = 28;
        const binW = (xMax - xMin) / numBins;
        const counts = new Array(numBins).fill(0);
        for (const s of samples) {
          if (s.delay > dropProg) continue;
          const x = mu + sigma * s.z;
          const b = Math.floor((x - xMin) / binW);
          if (b >= 0 && b < numBins) counts[b]++;
        }
        // normalize so histogram area ≈ 1 (same scale as pdf)
        const norm = 1 / (visibleN * binW);
        for (let b = 0; b < numBins; b++) {
          const x = xMin + b * binW;
          const y = counts[b] * norm;
          const sx = xToPx(x);
          const sy = yToPy(y);
          const sw = binW * xScale;
          ctx.fillStyle = H.alpha(H.COL.teal, 0.5);
          ctx.fillRect(sx + 1, sy, Math.max(0, sw - 2), cy0 - sy);
          ctx.strokeStyle = H.alpha(H.COL.teal, 0.9);
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 1, sy, Math.max(0, sw - 2), cy0 - sy);
        }
      }

      // === in-flight "falling" dots — sample whose delay is just below dropProg ===
      const recentWindow = 0.04;
      ctx.fillStyle = H.alpha(H.COL.fg, 0.9);
      for (const s of samples) {
        if (s.delay > dropProg) continue;
        if (dropProg - s.delay > recentWindow) continue;
        const ageRatio = (dropProg - s.delay) / recentWindow;  // 0=fresh, 1=settled
        const x = mu + sigma * s.z;
        const xx = xToPx(x);
        const fallY = padT + ageRatio * (cy0 - padT);
        ctx.beginPath();
        ctx.arc(xx, fallY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Theoretical curve overlay ===
      if (curveIn > 0.01) {
        ctx.beginPath();
        ctx.strokeStyle = H.alpha(H.COL.blue, curveIn);
        ctx.lineWidth = 3;
        for (let px = 0; px <= gw; px += 1) {
          const x = xMin + px / xScale;
          const y = pdf(x);
          const sx = padL + px, sy = yToPy(y);
          if (px === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // === μ vertical line + label ===
      if (sigIn > 0.01) {
        ctx.strokeStyle = H.alpha(H.COL.yellow, sigIn);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xToPx(mu), padT);
        ctx.lineTo(xToPx(mu), cy0);
        ctx.stroke();
        ctx.setLineDash([]);
        H.dot(ctx, xToPx(mu), yToPy(pdf(mu)), 4, H.alpha(H.COL.yellow, sigIn));

        // σ bracket
        const yArrow = yToPy(pdf(mu)) - 26;
        H.dimBracket(ctx,
          xToPx(mu - sigma), yArrow,
          xToPx(mu + sigma), yArrow,
          { color: H.COL.teal, labels: ["−σ", "+σ"], splitT: 0.5, alpha: sigIn, labelOffset: -16, labelSize: 15, labelColor: H.COL.fg }
        );

        ctx.fillStyle = H.alpha(H.COL.yellow, sigIn);
        ctx.font = `italic 16px ${H.FONT_MATH}`;
        ctx.textAlign = "center";
        ctx.fillText("μ", xToPx(mu), padT - 8);
        ctx.textAlign = "left";
      }

      // === x-tick labels ===
      ctx.fillStyle = H.alpha(H.COL.muted, axesIn);
      ctx.font = `italic 12px ${H.FONT_MATH}`;
      ctx.textAlign = "center";
      for (let x = -4; x <= 4; x++) {
        ctx.fillText(`${x}`, xToPx(x), cy0 + 22);
      }
      ctx.textAlign = "left";

      // === title ===
      H.formula(ctx, [
        { text: "f(x) = ", italic: false, color: H.COL.fg },
        { text: "1", color: H.COL.fg },
        { text: " / (", italic: false, color: H.COL.muted },
        { text: "σ", color: H.alpha(H.COL.teal, 0.4 + 0.6 * sigIn) },
        { text: "·√(2", italic: false, color: H.COL.muted },
        { text: "π", color: H.COL.fg },
        { text: ")) · e", italic: false, color: H.COL.fg },
        { text: " ^ −(x−", italic: false, color: H.COL.muted },
        { text: "μ", color: H.alpha(H.COL.yellow, 0.4 + 0.6 * sigIn) },
        { text: ")²/(2", italic: false, color: H.COL.muted },
        { text: "σ", color: H.alpha(H.COL.teal, 0.4 + 0.6 * sigIn) },
        { text: "²)", italic: false, color: H.COL.muted },
      ], w / 2, titleY, { size: 20 });

      // === sample count readout ===
      ctx.fillStyle = H.COL.muted;
      ctx.font = `13px ${H.FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(`N = ${visibleN}`, padL, padT - 16);
    },
  },
];
