# Bootstrap — paste this into a NEW session to start the build

`/start-work` is unavailable in this setup (skill file is empty). Use a new session instead: open a new conversation in this project directory (D:\coding_project\resourcebank) with any build-capable default agent, and paste the prompt below verbatim.

---

## Paste-ready prompt (中文版)

```
你是本项目的执行 worker。打开并严格遵循 D:\coding_project\resourcebank\.omo\plans\2026-09-19-dku-resource-bank\WORKORDER.md 工单，以及同目录下 00-overview.md、01-architecture.md、02-design-system.md、03-pages-spec.md、04-build-phases.md 全部计划文件，然后按工单的 First actions 初始化环境（node≥20 检查、git init 基线提交、创建 .omo/questions.md），再自主执行 Phase 0→6，直到 Definition of done（04 文件末尾）全部满足。

规则（工单里有完整版，这里是摘要）：
- 自主模式：绝不向我提问、不等确认。一切未决事项按 04-build-phases.md 的 Standing defaults 取默认值；所有临时决定逐条记录到 .omo/questions.md。
- 每个 Phase 必须先满足它的 Accept 验收项，才能进入下一个 Phase；验收不通过且当阶段修不好时，停止并写入 .omo/questions.md，不要把坏的工作往后带。
- 禁止用 Read 工具打开任何图片/二进制文件（logo 用 curl 或 Invoke-WebRequest 下载，用文件大小 >5KB 和 PNG 魔数校验，不看图）。
- react-bits 组件按 Phase 3 的指定来源复制并视为 vendored，不改其内部实现。
- GSAP 动画只用 transform/opacity；will-change 只用于过渡 overlay。
- 全程英文界面文案按 03-pages-spec.md 的 copy deck 逐字使用，⚑ 项记录到 .omo/questions.md 留给客户事后确认。
- 每完成一个 Phase 做一次 git 提交。全部完成后把验收证据写入 .omo/reviews/ 并输出总结。
```

## Paste-ready prompt (English version, if the session prefers English)

```
You are the execution worker for this project. Read and strictly follow the work order at D:\coding_project\resourcebank\.omo\plans\2026-09-19-dku-resource-bank\WORKORDER.md plus all five plan files in the same directory (00-overview, 01-architecture, 02-design-system, 03-pages-spec, 04-build-phases). Perform the work order's First actions (node >=20 check, git init baseline commit, create .omo/questions.md), then autonomously execute Phase 0 through 6 until the Definition of done at the end of 04-build-phases.md is fully met.

Rules (full versions are in the work order; summary):
- Autonomous mode: never ask me questions or wait for confirmation. Take frozen defaults from 04-build-phases.md Standing defaults; log every discretionary call in .omo/questions.md.
- A phase proceeds only after its Accept checks pass; if acceptance fails and cannot be fixed within the phase, stop and log it — never carry broken work forward.
- Never use the Read tool on any image/binary file (download the logo with curl or Invoke-WebRequest; verify via size >5KB and PNG magic bytes, not by viewing).
- Copy react-bits components exactly as specified in Phase 3 and treat them as vendored; do not edit their internals.
- GSAP animates only transform/opacity; will-change only on the transition overlay.
- All English UI copy is verbatim from the 03-pages-spec.md copy deck; flag ⚑ items in .omo/questions.md for later client sign-off.
- Git commit at the end of every phase. When finished, write acceptance evidence to .omo/reviews/ and output a summary.
```

## What to check when you return

1. Code: `client/` + `server/` packages exist; `npm run dev` runs both; `npm test` green
2. `.omo/questions.md` — every discretionary decision the worker made on your behalf (includes ⚑ copy items)
3. `.omo/reviews/` — per-phase acceptance evidence
4. Pending from you: D14 university-server facts (OS/runtime/domain/TLS/backup) — unlocks real deployment (Phase 6 config is parameterized meanwhile)
