// Chat — left column. Sessions, message history, LaTeX-rich messages,
// prompt chips, and the local Codex call that produces a viz spec.

const { useState: cUseState, useEffect: cUseEffect, useRef: cUseRef, useCallback: cUseCallback, useMemo: cUseMemo } = React;

// ---------- prompt chips ----------
const PROMPT_CHIPS = [
  { topic: "微积分", glyph: "∫", text: "可视化 sin x 在 [0, 2π] 上的定积分（黎曼和逼近）" },
  { topic: "微积分", glyph: "d", text: "在 x = 1 处展示 f(x) = x² 的导数：割线如何逼近切线" },
  { topic: "线性代数", glyph: "M", text: "演示二阶矩阵作用在单位圆上，把它变成一个椭圆" },
  { topic: "线性代数", glyph: "v", text: "展示二维向量的点积如何随夹角变化（含投影）" },
  { topic: "复变函数", glyph: "e", text: "可视化复函数 z → z² 把网格映成怎样的曲线" },
  { topic: "几何", glyph: "π", text: "用蒙特卡洛方法在单位圆上估算 π 的值" },
  { topic: "几何", glyph: "△", text: "海伦公式：三角形面积如何由三条边长决定" },
  { topic: "数论", glyph: "p", text: "在阿基米德螺线上标出素数（乌拉姆螺旋）" },
  { topic: "概率", glyph: "σ", text: "在网格上模拟二维布朗运动，并叠加均值轨迹" },
  { topic: "概率", glyph: "B", text: "用高尔顿钉板演示二项分布如何收敛到正态分布" },
  { topic: "三角", glyph: "θ", text: "把 sin、cos、tan 同时画在单位圆与折线坐标系上" },
];

// regenerate direction presets — appended to the original prompt
const REGEN_DIRECTIONS = [
  { id: "again",    label: "换种思路",   icon: "refresh", hint: "用完全不同的视角再做一次" },
  { id: "geometric",label: "更几何化",   icon: "compass", hint: "改用纯几何 / 图形演绎，少代数" },
  { id: "algebraic",label: "更代数化",   icon: "sliders", hint: "用代数推导和符号变换为主线" },
  { id: "layered",  label: "多分一些阶段", icon: "layers",  hint: "把动画拆成更多阶段，每段更慢" },
  { id: "param",    label: "多一个参数",  icon: "sliders", hint: "增加一个可调参数，让用户能改" },
];

// ---------- chat-specific icon helper ----------
const Icon = window.SvgIcon;

// ============================================================
//  Thinking state — rotating hints + cancel button
// ============================================================
const THINKING_HINTS = [
  "理解你的数学问题…",
  "选择视觉表现形式…",
  "规划动画阶段…",
  "编写 draw() 函数…",
  "调配颜色与字号…",
  "校验编译结果…",
];

function ThinkingBubble({ hint, onCancel }) {
  const [idx, setIdx] = cUseState(0);
  cUseEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % THINKING_HINTS.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="msg assistant thinking">
      <div className="avatar">L</div>
      <div className="msg-body">
        <div className="msg-name"><strong>Lumen</strong></div>
        <div className="msg-content">
          <span className="thinking-line">{hint || THINKING_HINTS[idx]}</span>
          <span className="thinking-dots"><span /><span /><span /></span>
          {onCancel && (
            <button className="cancel-btn" onClick={onCancel} title="取消">
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Regen menu — dropdown of direction options
// ============================================================
function RegenMenu({ onPick }) {
  const [open, setOpen] = cUseState(false);
  cUseEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!e.target.closest(".regen-wrap")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="regen-wrap">
      <button
        className="regen-btn"
        title="再生成一个版本"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="rotate-ccw" /> 再生成 <Icon name="chevron" />
      </button>
      {open && (
        <div className="regen-menu">
          {REGEN_DIRECTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => { onPick(d); setOpen(false); }}
            >
              <Icon name={d.icon} />
              <span className="rl">
                <span className="rt">{d.label}</span>
                <span className="rh">{d.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Message bubble with KaTeX
// ============================================================
function MessageBubble({ msg, onOpenViz, isActiveSpec, onRegenerate, onCancel }) {
  const bodyRef = cUseRef(null);

  cUseEffect(() => {
    if (!bodyRef.current) return;
    if (!msg.text) return;
    bodyRef.current.innerHTML = renderRichMarkdown(msg.text);
    if (window.renderMathInElement) {
      window.renderMathInElement(bodyRef.current, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }, [msg.text]);

  if (msg.role === "assistant" && msg.thinking) {
    return <ThinkingBubble hint={msg.thinkingHint} onCancel={onCancel} />;
  }

  const avatarChar = msg.role === "user" ? (msg.userInitial || "你") : "L";
  const name = msg.role === "user" ? "你" : "Lumen";

  return (
    <div className={`msg ${msg.role}`}>
      <div className="avatar">{avatarChar}</div>
      <div className="msg-body">
        <div className="msg-name">
          <strong>{name}</strong>
          {msg.time && <span>· {msg.time}</span>}
        </div>
        <div className="msg-content" ref={bodyRef} />
        {msg.specCard && (
          <div className="viz-card-row">
            <div
              className="viz-card"
              onClick={() => onOpenViz && onOpenViz(msg.specCard)}
            >
              <div className="card-icon">{msg.specCard.glyph || "ƒ"}</div>
              <div className="card-text">
                <div className="t1">{msg.specCard.title}</div>
                <div className="t2">{msg.specCard.category || "Visualization"} · 点击载入到右侧</div>
              </div>
              <div className="card-cta">
                {isActiveSpec && isActiveSpec(msg.specCard) ? "正在显示" : "打开"}
                <Icon name="chevron" />
              </div>
            </div>
            {msg.sourcePrompt && onRegenerate && (
              <RegenMenu onPick={(d) => onRegenerate(msg.sourcePrompt, d)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderRichMarkdown(src) {
  let s = src.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // Code spans `code`
  s = s.replace(/`([^`]+?)`/g, "<code>$1</code>");
  // Paragraphs
  const blocks = s.split(/\n\s*\n/).map((b) => `<p>${b.replace(/\n/g, "<br/>")}</p>`).join("");
  // Bold
  return blocks.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// ============================================================
//  Composer
// ============================================================
function Composer({ value, setValue, onSend, busy }) {
  const taRef = cUseRef(null);
  cUseEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(160, ta.scrollHeight) + "px";
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSend(v);
    setValue("");
  };

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={taRef}
          placeholder="描述一个数学概念、公式或定理…  支持 LaTeX：$e^{i\pi}+1=0$"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-bottom">
          <div className="composer-hints">
            <span><kbd>Enter</kbd> 发送</span>
            <span><kbd>Shift</kbd>+<kbd>Enter</kbd> 换行</span>
          </div>
          <button className="send-btn" onClick={submit} disabled={busy || !value.trim()}>
            <Icon name="send" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Chat panel
// ============================================================
function ChatPanel({
  session, sessions, onSelectSession, onNewSession, onDeleteSession,
  onAppendMessage, onUpdateLastAssistant, onRenameSession, onOpenViz, activeSpec, sendRef,
}) {
  const [input, setInput] = cUseState("");
  const [busy, setBusy] = cUseState(false);
  const [listOpen, setListOpen] = cUseState(false);
  const [bridgeStatus, setBridgeStatus] = cUseState("checking");
  const scrollRef = cUseRef(null);
  const requestIdRef = cUseRef(0);

  cUseEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages?.length, session?.messages?.[session.messages.length - 1]?.thinking]);

  const isActiveSpec = (spec) => activeSpec && (activeSpec.id === spec.id);

  // cancellation flag — when set, in-flight Codex response is dropped on arrival
  const cancelRef = cUseRef(false);

  const refreshBridgeStatus = cUseCallback(async () => {
    setBridgeStatus((prev) => (prev === "ready" ? "ready" : "checking"));
    const ok = await checkBridgeHealth();
    setBridgeStatus(ok ? "ready" : "offline");
    return ok;
  }, []);

  cUseEffect(() => {
    refreshBridgeStatus();
  }, [refreshBridgeStatus]);

  const sendPrompt = async (text, opts = {}) => {
    if (busy) return;
    const requestId = ++requestIdRef.current;
    setBusy(true);
    cancelRef.current = false;

    const sourcePrompt = opts.sourcePrompt || text;

    if (!opts.silent) {
      const userMsg = { role: "user", text, time: nowTime() };
      onAppendMessage(userMsg);
      if (session && shouldRenameSession(session, text) && onRenameSession) {
        onRenameSession(titleFromPrompt(text));
      }
    }
    onAppendMessage({ role: "assistant", thinking: true });

    try {
      const result = await generateViz(text, session?.id, opts.errorFeedback);
      if (cancelRef.current) {
        onUpdateLastAssistant({
          role: "assistant",
          text: "已取消。",
          time: nowTime(),
        });
        return;
      }
      if (requestId !== requestIdRef.current) return;

      if (result.spec) {
        onUpdateLastAssistant({
          role: "assistant",
          text: result.intro || `已为你生成 **${result.spec.title}** 的可视化。${result.spec.formula ? `\n\n$$${result.spec.formula}$$` : ""}`,
          specCard: { ...result.spec, glyph: result.spec.glyph || pickGlyph(result.spec) },
          time: nowTime(),
          sourcePrompt,
        });
        onOpenViz(result.spec);
      } else if (result.retryAfterError) {
        // Compile error — auto-retry once with the error sent back to Codex
        onUpdateLastAssistant({ role: "assistant", thinking: true, thinkingHint: "上一次有编译错误，正在修复…" });
        const retry = await generateViz(text, session?.id, result.retryAfterError);
        if (cancelRef.current) {
          onUpdateLastAssistant({ role: "assistant", text: "已取消。", time: nowTime() });
          return;
        }
        if (retry.spec) {
          onUpdateLastAssistant({
            role: "assistant",
            text: retry.intro || `已为你生成 **${retry.spec.title}** 的可视化。${retry.spec.formula ? `\n\n$$${retry.spec.formula}$$` : ""}`,
            specCard: { ...retry.spec, glyph: retry.spec.glyph || pickGlyph(retry.spec) },
            time: nowTime(),
            sourcePrompt,
          });
          onOpenViz(retry.spec);
        } else {
          onUpdateLastAssistant({
            role: "assistant",
            text: retry.text || "Codex 重试后仍然没有返回可执行的可视化 JSON。",
            time: nowTime(),
          });
        }
      } else {
        onUpdateLastAssistant({
          role: "assistant",
          text: result.text || "Codex 没有返回可执行的可视化 JSON。",
          time: nowTime(),
        });
      }
    } catch (err) {
      if (!cancelRef.current) {
        const fallback = fallbackVizFor(text, err.message || String(err));
        if (fallback.spec) {
          onUpdateLastAssistant({
            role: "assistant",
            text: fallback.text,
            specCard: fallback.spec,
            time: nowTime(),
            sourcePrompt,
          });
          onOpenViz(fallback.spec);
        } else {
          onUpdateLastAssistant({
            role: "assistant",
            text: fallback.text,
            time: nowTime(),
          });
        }
        setBridgeStatus("offline");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setBusy(false);
        cancelRef.current = false;
      }
    }
  };

  const cancelGeneration = () => {
    if (!busy) return;
    cancelRef.current = true;
    requestIdRef.current += 1;
    setBusy(false);
    onUpdateLastAssistant({
      role: "assistant",
      text: "已取消。",
      time: nowTime(),
    });
  };

  // expose sendPrompt to parent so VizRuntime runtime errors can trigger retries
  cUseEffect(() => {
    if (sendRef) sendRef.current = sendPrompt;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, session?.messages?.length]);

  // Regenerate: re-run the original user prompt with a direction hint.
  // direction (optional): { id, label, hint } from REGEN_DIRECTIONS
  const regenerate = (sourcePrompt, direction) => {
    const text = direction
      ? `${sourcePrompt}\n\n（请在保持主题不变的前提下，**${direction.label}**：${direction.hint}。不要重复上次的视觉结构。）`
      : sourcePrompt;
    sendPrompt(text, { silent: true, sourcePrompt });
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <h2>
          <span className="dot" />
          {session ? session.name : "对话"}
        </h2>
        <div className="chat-header-actions">
          <button
            className={`bridge-pill ${bridgeStatus}`}
            title={bridgeStatus === "ready" ? "本机 Codex bridge 已连接" : bridgeStatus === "checking" ? "正在检测本机 Codex bridge" : "未检测到本机 Codex bridge，将使用本地示例兜底"}
            onClick={refreshBridgeStatus}
          >
            <span />
            {bridgeStatus === "ready" ? "在线" : bridgeStatus === "checking" ? "检测中" : "本地"}
          </button>
          <button
            className="icon-btn"
            title="会话列表"
            onClick={() => setListOpen((v) => !v)}
          >
            <Icon name="book" />
          </button>
          <button className="icon-btn" title="新建会话" onClick={onNewSession}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      {listOpen && (
        <div className="session-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${session?.id === s.id ? "active" : ""}`}
              onClick={() => { onSelectSession(s.id); setListOpen(false); }}
            >
              <div className="label">{s.name}</div>
              <div className="meta">{s.messages.length}</div>
              {sessions.length > 1 && (
                <button
                  className="delete"
                  title="删除"
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="messages" ref={scrollRef}>
        {(!session?.messages || session.messages.length === 0) && (
          <Welcome onPick={(text) => sendPrompt(text)} />
        )}
        {(session?.messages || []).map((m, i) => (
          <MessageBubble
            key={i}
            msg={m}
            onOpenViz={onOpenViz}
            isActiveSpec={isActiveSpec}
            onRegenerate={regenerate}
            onCancel={m.thinking ? cancelGeneration : undefined}
          />
        ))}
      </div>

      <Composer
        value={input}
        setValue={setInput}
        onSend={sendPrompt}
        busy={busy}
      />
    </div>
  );
}

function Welcome({ onPick }) {
  const grouped = cUseMemo(() => {
    const m = new Map();
    PROMPT_CHIPS.forEach((c) => {
      if (!m.has(c.topic)) m.set(c.topic, []);
      m.get(c.topic).push(c);
    });
    return [...m.entries()];
  }, []);
  return (
    <div className="welcome">
      <div className="title">让数学 <em>看得见</em></div>
      <div className="sub">
        描述任意数学概念、公式或定理。我会用 Canvas 把它画出来——可以播放、调参、导出。
      </div>
      <div className="prompt-chips">
        {grouped.map(([topic, items]) => (
          <React.Fragment key={topic}>
            <div className="prompt-chip-section">{topic}</div>
            {items.map((c, i) => (
              <button key={`${topic}-${i}`} className="prompt-chip" onClick={() => onPick(c.text)}>
                <span className="glyph">{c.glyph}</span>
                <span className="text">{c.text}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function pickGlyph(spec) {
  const t = (spec.title || "").toLowerCase();
  const f = (spec.formula || "").toLowerCase();
  if (f.includes("\\int") || t.includes("积分")) return "∫";
  if (f.includes("\\sum") || t.includes("级数") || t.includes("和")) return "Σ";
  if (f.includes("\\sqrt") || t.includes("根")) return "√";
  if (f.includes("\\pi") || t.includes("π")) return "π";
  if (f.includes("e^") || t.includes("欧拉") || t.includes("指数")) return "e";
  if (t.includes("矩阵") || t.includes("matrix")) return "M";
  if (t.includes("向量") || t.includes("vector")) return "v";
  if (t.includes("概率") || t.includes("分布")) return "σ";
  return "ƒ";
}

function titleFromPrompt(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[。！？!?]+$/g, "")
    .trim();
  if (!clean) return "新对话";
  if (/^(你好|您好|hi|hello|hey)$/i.test(clean)) return "问候";
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean;
}

function shouldRenameSession(session, text) {
  const name = session?.name || "";
  const count = (session?.messages || []).length;
  if (count === 0) return true;
  if (!looksLikeMathRequest(text)) return false;
  return ["新对话", "初次对话", "问候", "对话"].includes(name);
}

function looksLikeMathRequest(text) {
  return /[=+\-*/^²√∫∑πθσ]|\\[a-zA-Z]+|公式|定理|证明|函数|曲线|图像|几何|代数|微积分|积分|导数|矩阵|向量|概率|分布|正态|二项|傅里叶|泰勒|欧拉|勾股|完全平方|面积|三角|圆|椭圆|复数|可视化|演示|展示|解释|生成|画/.test(text);
}

async function checkBridgeHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const res = await fetch(`${getCodexBase()}/health`, { signal: controller.signal });
    return res.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function deleteBridgeSession(sessionId) {
  if (!sessionId) return;
  try {
    await fetch(`${getCodexBase()}/v1/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  } catch (e) {}
}
window.lumenDeleteBridgeSession = deleteBridgeSession;

function fallbackVizFor(text, reason) {
  if (!looksLikeMathRequest(text)) {
    return {
      text: `本机 Codex bridge 暂不可用，暂时无法展开自由对话。\n\n错误：\`${reason}\``,
    };
  }

  const spec = findBestLocalSpec(text);
  if (!spec) {
    return {
      text: `本机 Codex bridge 暂不可用，无法为这个主题生成新的动画。\n\n错误：\`${reason}\``,
    };
  }

  return {
    spec,
    text:
      `本机 Codex bridge 暂不可用，我先为你打开最接近的内置可视化：**${spec.title}**。\n\n` +
      `要生成全新的动画，请先启动 bridge：\`node codex-bridge.mjs\`，然后重试这条消息。`,
  };
}

function findBestLocalSpec(text) {
  const examples = window.VIZ_EXAMPLES || [];
  if (!examples.length) return null;
  const q = String(text || "").toLowerCase();
  const rules = [
    { words: ["完全平方", "(a+b)", "a+b", "面积", "平方公式"], id: "binomial-square" },
    { words: ["欧拉", "euler", "复数", "复平面", "e^", "cos", "sin"], id: "euler" },
    { words: ["傅里叶", "fourier", "方波", "级数"], id: "fourier-square" },
    { words: ["泰勒", "taylor", "展开", "sin x", "sinx"], id: "taylor-sin" },
    { words: ["勾股", "pythag", "直角三角", "c^2"], id: "pythagoras" },
    { words: ["正态", "中心极限", "概率", "分布", "高斯", "sigma", "σ"], id: "normal" },
  ];

  for (const rule of rules) {
    if (rule.words.some((w) => q.includes(w.toLowerCase()))) {
      const hit = examples.find((e) => e.id === rule.id);
      if (hit) return hit;
    }
  }

  let best = null;
  let score = -1;
  for (const ex of examples) {
    const hay = `${ex.title || ""} ${ex.category || ""} ${ex.formula || ""}`.toLowerCase();
    const tokens = q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
    const s = tokens.reduce((acc, token) => acc + (hay.includes(token) ? 1 : 0), 0);
    if (s > score) {
      score = s;
      best = ex;
    }
  }
  return best || examples[0];
}

// ============================================================
//  generateViz: call Codex through the local bridge. Math visualization
//  requests return JSON specs; ordinary Q&A returns plain assistant text.
// ============================================================
async function generateViz(userText, sessionId, errorFeedback) {
  if (!sessionId) throw new Error("缺少 sessionId");
  const userContent = errorFeedback
    ? `${userText}\n\n（上一次生成的代码在编译/运行时出错：\`${errorFeedback}\`。请修正并重新生成完整 JSON。）`
    : userText;

  let raw;
  try {
    raw = await completeWithLlm({ sessionId, system: SYSTEM_PROMPT, message: userContent });
  } catch (e) {
    throw new Error(e.message || String(e));
  }

  // Extract JSON
  const spec = tryExtractJson(raw);
  if (!spec || !spec.draw) {
    return {
      text: raw || "Codex 没有返回内容。",
    };
  }

  // sanity defaults
  spec.id = spec.id || `codex-${Date.now()}`;
  spec.params = Array.isArray(spec.params) ? spec.params : [];
  spec.duration = typeof spec.duration === "number" ? spec.duration : 0;
  spec.loop = !!spec.loop;
  spec.category = spec.category || "Visualization";

  // Dry-run compile + first draw to catch errors before showing to user.
  // If something goes wrong AND we haven't already retried, ask for retry.
  if (!errorFeedback) {
    const compileErr = dryRunSpec(spec);
    if (compileErr) {
      return { retryAfterError: compileErr };
    }
  }

  const intro = spec.intro || spec.summary || `已生成 **${spec.title}** 的可视化。`;
  delete spec.intro; delete spec.summary;
  return { spec, intro };
}

function getCodexBase() {
  const explicit = window.LUMEN_LLM_ENDPOINT || localStorage.getItem("lumen_llm_endpoint");
  if (explicit) {
    try {
      const u = new URL(explicit);
      u.pathname = "";
      u.search = "";
      return u.toString().replace(/\/$/, "");
    } catch (e) {}
  }
  return "http://127.0.0.1:8787";
}

function getCodexEndpoint() {
  return `${getCodexBase()}/v1/complete`;
}

async function completeWithLlm(payload) {
  const endpoint = getCodexEndpoint();
  if (!endpoint || !window.fetch) {
    throw new Error("未配置本机 Codex bridge endpoint");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Codex bridge HTTP ${res.status}`);
  }
  if (typeof body.text !== "string") {
    throw new Error("Codex bridge response missing text");
  }
  return body.text;
}

// Dry-run: compile spec, render once to a hidden canvas at t=0 and t=0.5.
// Returns error string on failure, null on success.
function dryRunSpec(rawSpec) {
  try {
    const compiled = window.compileSpec(rawSpec);
    if (!compiled || typeof compiled.draw !== "function") return "draw 函数无法编译";
    if (compiled._compileError) return compiled._compileError;
    const c = document.createElement("canvas");
    c.width = 600; c.height = 400;
    const ctx = c.getContext("2d");
    const p = {};
    (compiled.params || []).forEach((pp) => { p[pp.name] = pp.default; });
    const state = {};
    if (typeof compiled.setup === "function") {
      compiled.setup(state, p, 600, 400, window.VIZ_HELPERS);
    }
    compiled.draw(ctx, 600, 400, p, 0, state, window.VIZ_HELPERS);
    compiled.draw(ctx, 600, 400, p, 0.5, state, window.VIZ_HELPERS);
    return null;
  } catch (e) {
    return e.message || String(e);
  }
}

function tryExtractJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  // Strip markdown code fences ```json ... ```
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // Find first { ... last }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = s.slice(first, last + 1);
  // First try strict parse
  try { return JSON.parse(slice); } catch (e) {}
  // Common failure: LaTeX with lone backslashes like \sin inside JSON strings.
  // Walk the source and double-up any backslash inside a string that isn't
  // followed by a valid JSON escape character.
  try { return JSON.parse(fixLatexEscapes(slice)); } catch (e) {}
  // Last-ditch: also normalize literal newlines inside strings
  try { return JSON.parse(normalizeLooseJson(slice)); } catch (e) {}
  return null;
}

function fixLatexEscapes(s) {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!inString) {
      if (c === '"') inString = true;
      out += c; i++; continue;
    }
    // inside a string literal
    if (c === '\\') {
      const next = s[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        out += c + next; i += 2; continue;
      }
      // invalid escape — double the backslash so JSON sees it as a literal \
      out += '\\\\'; i++; continue;
    }
    if (c === '"') { inString = false; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

function normalizeLooseJson(s) {
  // After backslash-fix, also replace raw CR/LF inside strings with \n.
  s = fixLatexEscapes(s);
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inString) {
      if (c === '"') inString = true;
      out += c; continue;
    }
    if (c === '\\') { out += c + (s[i + 1] || ""); i++; continue; }
    if (c === '"') { inString = false; out += c; continue; }
    if (c === '\n') { out += "\\n"; continue; }
    if (c === '\r') { out += "\\r"; continue; }
    if (c === '\t') { out += "\\t"; continue; }
    out += c;
  }
  return out;
}

// ============================================================
//  System prompt — defines the JSON spec contract Codex returns
// ============================================================
const SYSTEM_PROMPT = `你是 Lumen 的本机 Codex 后端。用户可能会进行普通问答，也可能会要求生成数学可视化。

如果用户是在普通问答、询问身份/能力/状态、或请求与数学可视化无关的帮助：直接用简洁中文回答，不要输出 JSON。

如果用户用中文描述一个数学概念或定理，并希望解释、展示、演示、生成或可视化：返回一段 manim / 3Blue1Brown 风格的**可运行 Canvas 分阶段动画**。

数学可视化请求必须**只输出一个 JSON 对象**（允许包在 \`\`\`json ... \`\`\` 里），绝不输出额外解释。

\`\`\`json
{
  "id":          "短英文 slug，如 a-plus-b-squared",
  "title":       "中文标题",
  "category":    "类别（Algebra / Calculus / Linear Algebra / Geometry / Fourier / Probability / Complex / Number Theory ...）",
  "formula":     "LaTeX 字符串（用于解释面板，不带 $）",
  "glyph":       "代表符号，如 □ ∫ Σ √ π e θ",
  "hideFormula": true,                  // 推荐 true：自己在画布中用 H.formula 渲染彩色公式标题，避免与 KaTeX 重复
  "intro":       "1-2 句导语",
  "explanation": "2-3 段解释，可用 **bold** 与 $LaTeX$ 内联公式",
  "params":      [ { "name":"a", "label":"a", "min":0.5, "max":2.5, "step":0.05, "default":1.2 } ],
  "duration":    8000,                  // 推荐 7000-14000 ms，**几乎总是动画**
  "loop":        true,                  // 默认 true，便于反复观看
  "draw":        "/* 函数体，签名 (ctx, w, h, p, t, state, H) */"
}
\`\`\`

### 这是动画引擎，不是静态图

\`t ∈ [0,1]\` 是动画进度。**几乎所有的 spec 都应该用阶段化的揭示**（先画框架，再依次淡入各部分），而不是一次性把所有东西画出来。用 \`H.fade(t, t0, t1)\` 得到 0..1 的平滑进入。每一帧都从 \`H.clear(ctx, w, h)\` 开始。

### 风格规范（manim / 3B1B 美学）

- 背景已是纯黑 #0A0E14。
- 主轮廓用白色 \`H.COL.fg\`，线宽 2px。
- 几何区域用半透明饱和色填充 + 同色亮色描边：
  - 绿 fill \`#5C7B3D\` / stroke \`#83C167\`（H.COL.green）
  - 棕 fill \`#8B4513\` / stroke \`#F0A95F\`（H.COL.orange）
  - 黄 fill \`#8B8B2F\` / stroke \`#FFD24C\`（H.COL.yellow）
  - 蓝 fill \`#2B6F7A\` / stroke \`#58C4DD\`（H.COL.blue）
  - 紫 fill \`#5A4A6E\` / stroke \`#9A72AC\`（H.COL.purple）
- 尺寸标注：用 \`H.dimBracket\`，颜色 \`H.COL.coral\`（#E89B95）。
- 文字、变量名永远用斜体衬线 \`H.FONT_MATH\`。中文用 \`H.FONT_SANS\`。
- 标题公式：用 \`H.formula\` 渲染彩色分段，让公式中的每一项与画布中对应区域**同色同名**。

### 你随时可以调用的辅助函数（H）

**几何 / 文字**
- \`H.clear(ctx, w, h)\` — 必须每帧调用
- \`H.region(ctx, x, y, rw, rh, { fill, stroke, fillAlpha=0.55, alpha, label, labelColor, labelSize })\` — 带描边和居中斜体标签的填充矩形；\`alpha\` 控制整体显隐
- \`H.traceRect(ctx, x, y, rw, rh, p, { color, width, alpha })\` — 周长按 \`p∈[0,1]\` 逐边"画出来"
- \`H.dimBracket(ctx, x1, y1, x2, y2, { color, labels:["b","a"], splitT, alpha, labelSide:±1, labelOffset, labelSize })\` — 双向虚线带箭头 + 中点 ✻ + 两段标签，manim 经典尺寸标注
- \`H.formula(ctx, segments, cx, cy, { size, baseFont })\` — segments: [{text, color, italic, weight, alpha}]，分段彩色公式
- \`H.arrow(ctx, x1,y1,x2,y2, { stroke, width, head })\`
- \`H.line(ctx, x1,y1,x2,y2, { stroke, width, dash })\`
- \`H.circle(ctx, x, y, r, { stroke, fill, width })\`
- \`H.dot(ctx, x, y, r, color)\`
- \`H.plot(ctx, fn, { x0, x1, xToPx, yToPy, color, width, steps })\`
- \`H.text(ctx, str, x, y, { color, size, italic, font, align })\`
- \`H.axes(ctx, cx, cy, gridW, gridH)\`
- \`H.mapper({ xMin, xMax, yMin, yMax, padL, padR, padT, padB, w, h }) → { xToPx, yToPy, gw, gh, padL... }\`

**时间 / 缓动**
- \`H.fade(t, t0, t1)\` — smoothstep ramp 0→1（区间外为 0 或 1）
- \`H.fade(t, t0, t1, t2, t3)\` — 进入 → 保持 → 退出（梯形）
- \`H.lerp(a, b, x)\`
- \`H.smooth(x)\` / \`H.easeInOut(x)\` / \`H.easeOutCubic(x)\`
- \`H.stagger(t, i, n, t0, perItem, overlap)\` — 让 n 个对象错峰出现
- \`H.alpha(color, a)\` — 给任意颜色加透明度，返回 rgba 字符串

**颜色调色板（H.COL）**
- fg / muted / dim / axis / grid
- blue / teal / yellow / red / green / purple / orange / pink / coral

### 一个完整可运行的范本（你应该输出类似结构）

\`\`\`js
H.clear(ctx, w, h);

// stage timings
const sqIn  = H.fade(t, 0.00, 0.15);
const brkIn = H.fade(t, 0.12, 0.25);
const aIn   = H.fade(t, 0.28, 0.40);
const bIn   = H.fade(t, 0.45, 0.57);

// layout
const a = p.a, b = p.b;
const scale = Math.min(w - 220, h - 240) / (a + b);
const sa = a * scale, sb = b * scale;
const x0 = (w - (sa + sb)) / 2 + 30;
const y0 = 150;

// title with colored terms — same colors as on-canvas regions
H.formula(ctx, [
  { text: "(a + b)" }, { text: "²", weight: "bold" },
  { text: " = ", italic: false },
  { text: "a²", color: H.alpha("#83C167", 0.4 + 0.6 * aIn) },
  ...
], w/2, 70, { size: 30 });

// 外框逐边画出
H.traceRect(ctx, x0, y0, sa+sb, sa+sb, sqIn);

// 尺寸标注
H.dimBracket(ctx, x0 - 26, y0, x0 - 26, y0 + sa + sb,
  { labels:["b","a"], splitT: sb / (sa+sb), alpha: brkIn });

// 区域逐个淡入
H.region(ctx, x0,      y0 + sb, sa, sa, { fill:"#5C7B3D", stroke:"#83C167", alpha:aIn, label:"a²" });
H.region(ctx, x0 + sa, y0,      sb, sb, { fill:"#8B4513", stroke:"#F0A95F", alpha:bIn, label:"b²" });
\`\`\`

### 公式与画面要**同步生长**（非常重要）

公式中每一项都必须和画布上对应的元素**同时**出现，而不是一开始就把整条公式以低 alpha 展示出来。**绝对不要**用 \`0.35 + 0.65 * fade\` 这种"先半透明再变实"的写法——一上来就能看到所有项，这违背了"动画演绎"的意图。

正确做法：每个项的 alpha **直接**等于它对应的阶段进度。前面的连接符（+、−、=）的 alpha **跟着后面那个操作数**一起 fade。例如：

\`\`\`js
H.formula(ctx, [
  { text: "a²", color: H.alpha(C_GREEN, aFade) },                          // 与 a² 区域同步
  { text: " + ", italic: false, color: H.alpha(H.COL.fg, bFade) },         // 跟 b² 一起出现
  { text: "b²", color: H.alpha(C_BROWN, bFade) },
  { text: " = ", italic: false, color: H.alpha(H.COL.fg, cFade) },         // 跟 c² 一起出现
  { text: "c²", color: H.alpha(H.COL.red, cFade) },
], w/2, 60, { size: 32 });
\`\`\`

如果是泰勒/傅里叶这种逐项叠加的式子，**循环里**对每一项算它自己的 fade 窗口，再 push 进 segs 数组——curve 也用同一个 fade 加权该项的贡献。这样公式增长 ↔ 曲线增长完美同步。


- **每帧 H.clear(ctx, w, h) 是必须的**。
- 字符串内反斜杠在 JSON 中要写 \`\\\\\`，例如 \`"formula":"e^{i\\\\theta}"\`。
- 禁止 \`document\`/\`window\`/\`fetch\`/\`require\`/\`import\`。只能用 \`Math.*\` 和 H.*。
- 文字字号 ≥ 12，公式标题 ≥ 24。
- 用 1-3 个参数滑块，让用户能修改几何尺寸或函数变量；动画 t 控制揭示节奏，不要让 t 直接驱动那些应该由滑块控制的量。
- **多阶段（4-7 个 stage）**是首选结构：先 framing（坐标/外框）→ labels（尺寸标注）→ 主元素逐个揭示 → 收尾（关键等式或结论一笔点出）。
- 收尾的最后一阶段（t > 0.85）让所有元素保持显示，便于用户看完整结果。
- 配色：标题公式中代表"a 部分"的项与画布中"a 部分"区域**必须同色**，让眼睛能跟踪对应。`;

window.ChatPanel = ChatPanel;
