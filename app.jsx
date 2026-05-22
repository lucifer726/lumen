// App shell — top-level state, session storage, rail nav.

const { useState: aUseState, useEffect: aUseEffect, useMemo: aUseMemo, useCallback: aUseCallback, useRef: aUseRef } = React;

// Default tweak values (in-design controls in the Tweaks panel).
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#29C5F6",
  "density": "regular",
  "mathFont": "serif",
  "showAxes": true,
  "autoPlay": true,
  "speed": 1
}/*EDITMODE-END*/;

const STORAGE_KEY = "vz_sessions_v4";
const USER_EXAMPLES_KEY = "vz_user_examples_v1";

// User-saved examples: strip the compiled spec back to a serializable shape so
// it round-trips through JSON. Codex-generated specs already have draw as a
// string; presets ship draw as a function whose body we captured in
// _drawSource during compileSpec.
function specToSavable(spec, paramValues) {
  if (!spec) return null;
  const drawSrc =
    spec._drawSource ||
    (typeof spec.draw === "function"
      ? (spec.draw.toString().match(/\{([\s\S]*)\}\s*$/) || [, ""])[1].trim()
      : (typeof spec.draw === "string" ? spec.draw : ""));
  const setupSrc =
    spec._setupSource ||
    (typeof spec.setup === "function"
      ? (spec.setup.toString().match(/\{([\s\S]*)\}\s*$/) || [, ""])[1].trim()
      : (typeof spec.setup === "string" ? spec.setup : undefined));
  const params = (spec.params || []).map((p) => {
    if (!paramValues || !Object.prototype.hasOwnProperty.call(paramValues, p.name)) return { ...p };
    return { ...p, default: paramValues[p.name] };
  });
  const stages = Array.isArray(spec.stages)
    ? spec.stages.map((s) => ({ ...s })).filter((s) => typeof s.t === "number")
    : [];
  return {
    title: spec.title,
    category: spec.category,
    formula: spec.formula,
    glyph: spec.glyph,
    hideFormula: spec.hideFormula,
    intro: spec.intro,
    explanation: spec.explanation,
    params,
    duration: spec.duration || 0,
    loop: !!spec.loop,
    draw: drawSrc,
    ...(setupSrc ? { setup: setupSrc } : {}),
    ...(stages.length ? { stages } : {}),
  };
}

function normalizeUserExample(ex) {
  if (!ex || typeof ex !== "object" || typeof ex.draw !== "string") return null;
  const id = typeof ex.id === "string" && ex.id ? ex.id : `user_${Date.now().toString(36)}`;
  return {
    ...ex,
    id,
    sourceId: ex.sourceId || ex.id || id,
    savedAt: typeof ex.savedAt === "number" ? ex.savedAt : Date.now(),
    params: Array.isArray(ex.params) ? ex.params : [],
  };
}

function loadUserExamples() {
  try {
    const raw = localStorage.getItem(USER_EXAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeUserExample).filter(Boolean) : [];
  } catch (e) { return []; }
}
function saveUserExamples(list) {
  try { localStorage.setItem(USER_EXAMPLES_KEY, JSON.stringify(list)); } catch (e) {}
}

// Spec serialization: function-based presets can't survive JSON, so we replace
// them with a {__preset: id} reference and resolve on load.
function serializeSpec(spec) {
  if (!spec) return null;
  if (typeof spec.draw === "function") return { __preset: spec.id, title: spec.title, category: spec.category };
  return spec;
}
function deserializeSpec(stored) {
  if (!stored) return null;
  if (stored.__preset) {
    return (window.VIZ_EXAMPLES || []).find((e) => e.id === stored.__preset) || null;
  }
  return stored;
}
function serializeSession(s) {
  return {
    ...s,
    activeSpec: serializeSpec(s.activeSpec),
    messages: (s.messages || []).map((m) => ({
      ...m,
      specCard: m.specCard ? serializeSpec(m.specCard) : undefined,
    })),
  };
}
function deserializeSession(s) {
  return {
    ...s,
    activeSpec: deserializeSpec(s.activeSpec),
    messages: (s.messages || []).map((m) => ({
      ...m,
      specCard: m.specCard ? deserializeSpec(m.specCard) : undefined,
    })).filter((m) => !m.thinking),  // never persist a thinking placeholder
  };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.sessions)) {
      return { ...parsed, sessions: parsed.sessions.map(deserializeSession) };
    }
  } catch (e) {}
  return null;
}
function saveSessions(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...payload,
      sessions: payload.sessions.map(serializeSession),
    }));
  } catch (e) {}
}

function newSession(name = "新对话") {
  return {
    id: `s_${Math.random().toString(36).slice(2, 9)}`,
    name,
    createdAt: Date.now(),
    messages: [],
    activeSpec: null,
  };
}

function App() {
  // Tweaks
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const bootUserExamples = aUseMemo(() => loadUserExamples(), []);

  // Apply tweaks as CSS variables on :root
  aUseEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--vz-accent", tw.accent);
    // derive soft/line variants
    const hex = tw.accent.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    root.style.setProperty("--vz-accent-soft", `rgba(${r},${g},${b},0.16)`);
    root.style.setProperty("--vz-accent-line", `rgba(${r},${g},${b},0.32)`);

    const fontSize = tw.density === "compact" ? "13px" : tw.density === "comfy" ? "15px" : "14px";
    root.style.fontSize = fontSize;
    document.body.style.fontSize = fontSize;
  }, [tw.accent, tw.density]);

  // session model
  const initial = aUseMemo(() => {
    const fallbackSpec = bootUserExamples[0] || (window.VIZ_EXAMPLES || [])[0] || null;
    const loaded = loadSessions();
    if (loaded && loaded.sessions.length) {
      const activeLoadedId = loaded.activeId || loaded.sessions[0].id;
      const sessionsWithFallback = loaded.sessions.map((s) =>
        s.id === activeLoadedId && !s.activeSpec && fallbackSpec
          ? { ...s, activeSpec: fallbackSpec }
          : s
      );
      return { sessions: sessionsWithFallback, activeId: activeLoadedId };
    }
    const first = newSession("初次对话");
    // Pre-seed the very first session so the canvas doesn't flash empty; when
    // the user has saved examples, the most recent one should be what they see.
    first.activeSpec = fallbackSpec;
    return { sessions: [first], activeId: first.id };
  }, [bootUserExamples]);

  const [sessions, setSessions] = aUseState(initial.sessions);
  const [activeId, setActiveId] = aUseState(initial.activeId);
  const [fullscreen, setFullscreen] = aUseState(false);
  const [navTab, setNavTab] = aUseState("chat");
  const [userExamples, setUserExamples] = aUseState(bootUserExamples);
  const chatSendRef = aUseRef(null);

  aUseEffect(() => { saveUserExamples(userExamples); }, [userExamples]);

  // persistence
  aUseEffect(() => {
    saveSessions({ sessions, activeId });
  }, [sessions, activeId]);

  const activeSession = aUseMemo(
    () => sessions.find((s) => s.id === activeId) || sessions[0],
    [sessions, activeId]
  );

  // Note: serialized specs lose their compiled `draw` function (Function objects don't JSON-serialize),
  // but Codex-generated specs originally come with `draw` as a string. The runtime will recompile.
  // Presets keep their JS draw because they're held in memory at runtime.
  const activeSpec = activeSession?.activeSpec || null;

  const updateActiveSession = aUseCallback((updater) => {
    setSessions((prev) => prev.map((s) => (s.id === activeId ? updater(s) : s)));
  }, [activeId]);

  const renameActiveSession = aUseCallback((name) => {
    if (!name) return;
    updateActiveSession((s) => ({ ...s, name }));
  }, [updateActiveSession]);

  const appendMessage = aUseCallback((msg) => {
    updateActiveSession((s) => ({ ...s, messages: [...s.messages, msg] }));
  }, [updateActiveSession]);

  const updateLastAssistant = aUseCallback((msg) => {
    updateActiveSession((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") { msgs[i] = msg; break; }
      }
      return { ...s, messages: msgs };
    });
  }, [updateActiveSession]);

  const openViz = aUseCallback((spec) => {
    updateActiveSession((s) => ({ ...s, activeSpec: spec }));
  }, [updateActiveSession]);

  // Update the spec on the active message after a Code-panel edit
  const updateActiveSpec = aUseCallback((newSpec) => {
    updateActiveSession((s) => {
      const msgs = s.messages.map((m) =>
        m.specCard && m.specCard.id === s.activeSpec?.id ? { ...m, specCard: newSpec } : m
      );
      return { ...s, activeSpec: newSpec, messages: msgs };
    });
  }, [updateActiveSession]);

  // Find the source prompt that produced the currently active spec
  const findActiveSourcePrompt = aUseCallback(() => {
    if (!activeSession || !activeSession.activeSpec) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const m = activeSession.messages[i];
      if (m.specCard && m.specCard.id === activeSession.activeSpec.id && m.sourcePrompt) {
        return m.sourcePrompt;
      }
    }
    return null;
  }, [activeSession]);

  // Runtime error: ask Codex to fix it
  const handleRuntimeError = aUseCallback((errorMsg, t) => {
    const prompt = findActiveSourcePrompt();
    if (!prompt || !chatSendRef.current) return;
    const feedback = `运行时错误（动画进度 t=${(t || 0).toFixed(2)}）：${errorMsg}`;
    chatSendRef.current(prompt, { silent: true, sourcePrompt: prompt, errorFeedback: feedback });
  }, [findActiveSourcePrompt]);

  const isSavedExample = aUseCallback(
    (spec) => !!(spec && userExamples.some((u) => u.sourceId === spec.id || u.id === spec.id)),
    [userExamples]
  );

  const handleToggleSaveExample = aUseCallback((spec, paramValues) => {
    if (!spec) return;
    const existing = userExamples.find((u) => u.sourceId === spec.id || u.id === spec.id);
    if (existing) {
      setUserExamples((prev) => prev.filter((u) => u.id !== existing.id));
      return;
    }
    const savable = specToSavable(spec, paramValues);
    if (!savable) return;
    const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setUserExamples((prev) => [
      { id, sourceId: spec.id, savedAt: Date.now(), ...savable },
      ...prev,
    ]);
  }, [userExamples]);

  const handleDeleteUserExample = aUseCallback((id) => {
    setUserExamples((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const handleNewSession = aUseCallback(() => {
    const fresh = newSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
  }, []);

  const handleDeleteSession = aUseCallback((id) => {
    if (window.lumenDeleteBridgeSession) window.lumenDeleteBridgeSession(id);
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const f = newSession();
        setActiveId(f.id);
        return [f];
      }
      if (id === activeId) setActiveId(filtered[0].id);
      return filtered;
    });
  }, [activeId]);

  const handleClearAll = aUseCallback(() => {
    if (!window.confirm("确定要清空全部对话历史吗？此操作不可撤销。")) return;
    if (window.lumenDeleteBridgeSession) {
      sessions.forEach((s) => window.lumenDeleteBridgeSession(s.id));
    }
    const f = newSession();
    f.activeSpec = (window.VIZ_EXAMPLES || [])[0] || null;
    setSessions([f]);
    setActiveId(f.id);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }, [sessions]);

  return (
    <div className="app">
      {/* Left rail */}
      <div className="rail">
        <div className="rail-logo" title="Lumen">
          <svg viewBox="0 0 24 24" fill="none" stroke="#77EDEF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12c4 0 5 -7 9 -7s5 7 9 7" />
            <circle cx="12" cy="12" r="1.4" fill="#77EDEF" stroke="none" />
          </svg>
        </div>
        <button
          className={`rail-btn ${navTab === "chat" ? "active" : ""}`}
          title="对话"
          onClick={() => setNavTab("chat")}
        >
          <SvgIcon name="message" />
        </button>
        <button
          className={`rail-btn ${navTab === "examples" ? "active" : ""}`}
          title="示例库"
          onClick={() => setNavTab("examples")}
        >
          <SvgIcon name="book" />
        </button>
        <div className="rail-spacer" />
        <button
          className={`rail-btn ${navTab === "settings" ? "active" : ""}`}
          title="设置"
          onClick={() => setNavTab("settings")}
        >
          <SvgIcon name="settings" />
        </button>
      </div>

      {/* Middle: chat / examples / settings */}
      {navTab === "chat" ? (
        <ChatPanel
          session={activeSession}
          sessions={sessions}
          onSelectSession={setActiveId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onAppendMessage={appendMessage}
          onUpdateLastAssistant={updateLastAssistant}
          onRenameSession={renameActiveSession}
          onOpenViz={openViz}
          activeSpec={activeSpec}
          sendRef={chatSendRef}
        />
      ) : navTab === "examples" ? (
        <ExamplesPanel
          examples={window.VIZ_EXAMPLES}
          userExamples={userExamples}
          activeSpec={activeSpec}
          onOpenViz={(s) => { openViz(s); setNavTab("chat"); }}
          onDeleteUserExample={handleDeleteUserExample}
          onBackToChat={() => setNavTab("chat")}
        />
      ) : (
        <SettingsPanel
          sessions={sessions}
          onClearAll={handleClearAll}
          onBackToChat={() => setNavTab("chat")}
        />
      )}

      {/* Right: viz */}
      <VizRuntime
        spec={activeSpec}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((v) => !v)}
        autoPlay={tw.autoPlay}
        speed={tw.speed || 1}
        accent={tw.accent}
        showAxes={tw.showAxes}
        mathFont={tw.mathFont}
        onRuntimeError={handleRuntimeError}
        onSaveSpec={updateActiveSpec}
        onToggleSaveExample={handleToggleSaveExample}
        isSavedExample={isSavedExample(activeSpec)}
      />

      {/* Tweaks (toggled from toolbar) */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="主题" />
        <TweakColor
          label="强调色"
          value={tw.accent}
          options={["#29C5F6", "#77EDEF", "#9A72AC", "#FFD24C", "#FC6255"]}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakRadio
          label="密度"
          value={tw.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakSection label="动画" />
        <TweakSelect
          label="速度"
          value={String(tw.speed || 1)}
          options={["0.25", "0.5", "1", "1.5", "2", "3"]}
          onChange={(v) => setTweak("speed", Number(v))}
        />
        <TweakToggle
          label="自动播放"
          value={tw.autoPlay}
          onChange={(v) => setTweak("autoPlay", v)}
        />
        <TweakToggle
          label="显示坐标轴"
          value={tw.showAxes}
          onChange={(v) => setTweak("showAxes", v)}
        />
      </TweaksPanel>
    </div>
  );
}

// ============================================================
//  Examples library panel — with offscreen-rendered thumbnails
// ============================================================
const THUMB_CACHE = {};

function getThumbnail(spec) {
  if (!spec) return null;
  if (THUMB_CACHE[spec.id]) return THUMB_CACHE[spec.id];
  try {
    const compiled = window.compileSpec(spec);
    if (!compiled || typeof compiled.draw !== "function" || compiled._compileError) return null;
    const W = 240, H = 140;
    const renderW = W * 4, renderH = H * 4;
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = renderW;
    renderCanvas.height = renderH;
    const renderCtx = renderCanvas.getContext("2d");
    renderCtx.fillStyle = "#0A0E14";
    renderCtx.fillRect(0, 0, renderW, renderH);
    const p = {};
    (compiled.params || []).forEach((pp) => { p[pp.name] = pp.default; });
    const state = {};
    if (compiled.setup) {
      try { compiled.setup(state, p, renderW, renderH, window.VIZ_HELPERS); } catch (e) {}
    }
    // Render on a stage-sized canvas first. Several examples use fixed label
    // sizes, so drawing directly at thumbnail size clips formulas and callouts.
    compiled.draw(renderCtx, renderW, renderH, p, 0.95, state, window.VIZ_HELPERS);

    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0A0E14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    THUMB_CACHE[spec.id] = url;
    return url;
  } catch (e) {
    return null;
  }
}

function ExamplesPanel({ examples, userExamples = [], activeSpec, onOpenViz, onDeleteUserExample, onBackToChat }) {
  // Build thumbnails lazily on mount — include user-saved examples too.
  const allForThumbs = aUseMemo(() => [...examples, ...userExamples], [examples, userExamples]);
  const thumbs = aUseMemo(
    () => allForThumbs.map((ex) => ({ id: ex.id, url: getThumbnail(ex) })),
    [allForThumbs]
  );
  const thumbMap = aUseMemo(() => Object.fromEntries(thumbs.map((t) => [t.id, t.url])), [thumbs]);

  // group by category for a nicer layout
  const grouped = aUseMemo(() => {
    const m = new Map();
    examples.forEach((ex) => {
      const k = (ex.category || "其他").split("·")[0].trim();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(ex);
    });
    return [...m.entries()];
  }, [examples]);

  return (
    <div className="chat">
      <div className="chat-header">
        <h2>
          <span className="dot" style={{ background: "#FFD24C", boxShadow: "0 0 8px #FFD24C" }} />
          示例库
        </h2>
        <div className="chat-header-actions">
          <button className="icon-btn" title="返回对话" onClick={onBackToChat}>
            <SvgIcon name="message" />
          </button>
        </div>
      </div>
      <div className="messages">
        <div className="welcome">
          <div className="title">精选 <em>示例</em></div>
          <div className="sub">点击任意卡片，即可在右侧载入完整的可交互可视化；右上角书签会把当前画布保存到这里。</div>
        </div>
        {userExamples.length > 0 && (
          <React.Fragment>
            <div className="prompt-chip-section">我的示例</div>
            <div className="example-grid">
              {userExamples.map((ex) => (
                <div
                  key={ex.id}
                  className={`example-card user-example ${activeSpec?.id === ex.id ? "active" : ""}`}
                >
                  <button
                    className="example-card-body"
                    onClick={() => onOpenViz(ex)}
                  >
                    <div
                      className="thumb"
                      style={thumbMap[ex.id] ? { backgroundImage: `url(${thumbMap[ex.id]})` } : {}}
                    >
                      {!thumbMap[ex.id] && <span className="thumb-glyph">{glyphFor(ex)}</span>}
                    </div>
                    <div className="meta">
                      <div className="t1">{ex.title || "未命名"}</div>
                      <div className="t2">{ex.duration > 0 ? "动画" : "静态"} · {(ex.params || []).length} 参数</div>
                    </div>
                  </button>
                  <button
                    className="example-card-del"
                    title="从收藏移除"
                    onClick={(e) => { e.stopPropagation(); onDeleteUserExample && onDeleteUserExample(ex.id); }}
                  >
                    <SvgIcon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          </React.Fragment>
        )}
        {grouped.map(([cat, items]) => (
          <React.Fragment key={cat}>
            <div className="prompt-chip-section">{cat}</div>
            <div className="example-grid">
              {items.map((ex) => (
                <button
                  key={ex.id}
                  className={`example-card ${activeSpec?.id === ex.id ? "active" : ""}`}
                  onClick={() => onOpenViz(ex)}
                >
                  <div
                    className="thumb"
                    style={thumbMap[ex.id] ? { backgroundImage: `url(${thumbMap[ex.id]})` } : {}}
                  >
                    {!thumbMap[ex.id] && <span className="thumb-glyph">{glyphFor(ex)}</span>}
                  </div>
                  <div className="meta">
                    <div className="t1">{ex.title}</div>
                    <div className="t2">{ex.duration > 0 ? "动画" : "静态"} · {(ex.params || []).length} 参数</div>
                  </div>
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ============================================================
//  Settings panel — formerly disabled gear button
// ============================================================
function SettingsPanel({ sessions, onClearAll, onBackToChat }) {
  const totalMessages = sessions.reduce((acc, s) => acc + (s.messages || []).length, 0);
  const exportSessions = () => {
    const payload = JSON.stringify({ sessions }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumen-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <h2>
          <span className="dot" style={{ background: "#9A72AC", boxShadow: "0 0 8px #9A72AC" }} />
          设置
        </h2>
        <div className="chat-header-actions">
          <button className="icon-btn" title="返回对话" onClick={onBackToChat}>
            <SvgIcon name="message" />
          </button>
        </div>
      </div>
      <div className="messages settings-body">
        <div className="welcome">
          <div className="title">设 <em>置</em></div>
          <div className="sub">主题/速度/坐标轴等视觉设定，请打开右下的 <code>Tweaks</code> 面板。这里只放偏运营的开关。</div>
        </div>

        <div className="settings-group">
          <div className="settings-label">数据</div>
          <div className="settings-stat">
            <span>{sessions.length} 个会话</span>
            <span>{totalMessages} 条消息</span>
          </div>
          <div className="settings-row">
            <button className="settings-btn" onClick={exportSessions}>
              <SvgIcon name="download" /> 导出全部会话（JSON）
            </button>
            <button className="settings-btn danger" onClick={onClearAll}>
              <SvgIcon name="trash" /> 清空全部会话
            </button>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-label">键盘快捷键（动画播放时）</div>
          <table className="kbd-table">
            <tbody>
              <tr><td><kbd>Space</kbd></td><td>播放 / 暂停</td></tr>
              <tr><td><kbd>R</kbd></td><td>重新播放</td></tr>
              <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>后退 / 前进 5%</td></tr>
              <tr><td><kbd>1</kbd> – <kbd>9</kbd></td><td>跳到对应阶段</td></tr>
              <tr><td><kbd>⌘</kbd> + <kbd>Enter</kbd></td><td>代码面板内应用编辑</td></tr>
            </tbody>
          </table>
        </div>

        <div className="settings-group">
          <div className="settings-label">关于</div>
          <p className="settings-about">
            Lumen 把任意中文数学描述变成 3Blue1Brown 风格的 Canvas 动画。
            生成代码可在右侧画布上方点 <code>&lt;/&gt;</code> 按钮查看并直接编辑。
          </p>
        </div>
      </div>
    </div>
  );
}

function glyphFor(spec) {
  const t = (spec.title || "");
  if (t.includes("欧拉")) return "e";
  if (t.includes("傅里叶")) return "Σ";
  if (t.includes("泰勒")) return "ƒ";
  if (t.includes("勾股")) return "△";
  if (t.includes("正态")) return "σ";
  return "ƒ";
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
