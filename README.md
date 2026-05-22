# Lumen

Lumen 是一个本地运行的数学可视化工具：用户用中文描述一个数学概念，应用会生成一段 3Blue1Brown 风格的 Canvas 动画，并提供参数调节、时间轴预览、代码编辑和导出能力。

## 功能

- 中文对话式生成数学动画，适合微积分、线性代数、概率、几何、数论等主题。
- 预置示例即开即用；Codex bridge 离线时会回退到最接近的本地示例。
- 每个可视化都是一个可编辑的 `spec`：包含标题、公式、参数、动画时长和 `draw(ctx,w,h,p,t,state,H)`。
- Canvas 运行时支持时间轴、阶段提示、参数滑块、主题微调、PNG/WebM 导出。
- 本地 bridge 使用 `codex exec` 维护会话线程，前端不需要直接管理 LLM 历史。

## 运行要求

- 桌面浏览器，窗口宽度建议不小于 900 px。
- Node.js，用于运行 `codex-bridge.mjs`。
- Python 3，用于启动静态文件服务器。
- Codex CLI，用于真实生成可视化；没有 Codex CLI 时仍可浏览预置示例。

项目没有构建步骤，也没有 npm 依赖。React、Babel 和 KaTeX 通过 CDN 加载。

## 快速开始

```bash
./start.sh
```

然后打开：

```text
http://127.0.0.1:5173/
```

也可以使用 npm 脚本：

```bash
npm start
```

默认服务：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Web | `http://127.0.0.1:5173` | 静态前端 |
| Bridge | `http://127.0.0.1:8787` | 本地 Codex API adapter |

按 `Ctrl-C` 会同时关闭两个进程。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LUMEN_WEB_HOST` | `127.0.0.1` | 静态服务器监听地址 |
| `LUMEN_WEB_PORT` | `5173` | 静态服务器端口 |
| `LUMEN_CODEX_HOST` | `127.0.0.1` | bridge 监听地址 |
| `LUMEN_CODEX_PORT` | `8787` | bridge 端口 |
| `LUMEN_CODEX_BIN` | `codex` | Codex CLI 可执行文件 |
| `LUMEN_CODEX_CWD` | 当前目录 | Codex 执行目录 |
| `LUMEN_CODEX_MODEL` | 空 | 传给 Codex CLI 的模型名 |
| `LUMEN_CODEX_PROFILE` | 空 | 首次会话使用的 Codex profile |
| `LUMEN_CODEX_TIMEOUT_MS` | `180000` | 单次生成超时时间 |

前端默认请求 `http://127.0.0.1:8787`。如需覆盖，可以在浏览器控制台设置：

```js
localStorage.setItem("lumen_llm_endpoint", "http://127.0.0.1:8787");
```

## 项目结构

```text
.
├── index.html          # 页面入口，按顺序加载所有脚本
├── start.sh            # 同时启动 bridge 和静态服务器
├── codex-bridge.mjs    # 本地 Codex CLI adapter
├── examples.js         # 内置可视化 preset
├── viz-runtime.jsx     # Canvas 运行时、时间轴、导出、代码编辑
├── tweaks-panel.jsx    # 视觉参数面板
├── chat.jsx            # 对话面板、提示词、LLM 调用和 spec 校验
├── app.jsx             # 顶层状态、会话和设置
├── styles.css          # UI 样式
├── ds/                 # 设计系统补充样式
└── screenshots/        # README 和调试截图
```

## 可视化 Spec

Lumen 的核心数据结构是一个可视化 `spec`。预置示例和 LLM 生成结果都使用同一个形状：

```js
{
  id,
  title,
  category,
  formula,
  glyph,
  hideFormula,
  intro,
  explanation,
  params: [{ name, label, min, max, step, default }],
  duration,
  loop,
  setup(state, params, w, h, H) {},
  draw(ctx, w, h, params, t, state, H) {}
}
```

`t` 是 `0..1` 的动画进度。建议使用 `H.fade(t, start, end)` 拆分动画阶段，因为运行时会用这些调用推导时间轴下方的阶段提示。

## 安全与隐私

- 默认只绑定 `127.0.0.1`，不要把 bridge 暴露到公网。
- bridge 会把前端会话 id 映射到 Codex thread id，并把映射保存在 `.lumen/sessions.json`；该目录应保持本地私有。
- LLM 生成的 `draw` 会在浏览器内编译执行。运行时会限制常见危险全局对象，但仍建议只加载可信来源的 spec。
- `.omx`、`.traces`、`.lumen`、`uploads`、IDE 配置和系统文件不应提交到公开仓库。

## 给 Agent 的工作说明

如果你是 coding agent，请先阅读本节和 `AGENTS.md`。

- 运行应用优先使用 `./start.sh` 或 `npm start`。
- 不要引入构建系统或新依赖，除非任务明确要求。
- UI 文案保持简体中文，不使用 emoji。
- `index.html` 的脚本加载顺序很重要：`examples.js` → `viz-runtime.jsx` → `tweaks-panel.jsx` → `chat.jsx` → `app.jsx`。
- `chat.jsx` 中的 `SYSTEM_PROMPT` 和 `viz-runtime.jsx` 中的 `buildHelpers()` 必须保持同步。
- 不要移动或重排 `app.jsx` 中 `EDITMODE-BEGIN` / `EDITMODE-END` 标记包住的 `TWEAK_DEFAULTS`。
- 修改 bridge 时注意 `codex exec` 和 `codex exec resume` 支持的参数不同，不要合并 `firstCallArgs()` 和 `resumeCallArgs()`。

更详细的 agent 说明见 `CLAUDE.md`。
