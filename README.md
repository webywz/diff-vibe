# diff-vibe

<p align="center">
  <a href="https://github.com/webywz/diff-vibe/actions/workflows/ci.yml"><img src="https://github.com/webywz/diff-vibe/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@webywz/diff-vibe"><img src="https://img.shields.io/npm/v/@webywz/diff-vibe.svg" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
</p>

<p align="center">
  <strong>Stylish PR titles and bodies from a git diff. Offline-first. AI-optional.</strong><br/>
  One command, the current diff, a review-ready pull request draft.
</p>

<p align="center">
  一条命令，把当前 git diff 写成有品味的 PR title + body。<br/>
  无 API Key 也能用；有 Key 再可选 AI。
</p>

Companion spirit to [vibe-commit](https://github.com/webywz/vibe-commit): commits there, pull requests here.

与 [vibe-commit](https://github.com/webywz/vibe-commit) 成对：那边写 commit，这边写 PR。

Package: [`@webywz/diff-vibe`](https://www.npmjs.com/package/@webywz/diff-vibe) · CLI: `diff-vibe` · Node.js **18.18+** · requires `git`

---

## Features · 特性

| | EN | 中文 |
| --- | --- | --- |
| Offline first | Heuristic always on — paths, hunks, identifiers → type / scope / subject + markdown body | 启发式始终可用，从路径与 diff 推断 type / scope / subject 与正文 |
| AI optional | OpenAI or Anthropic when a key is set; silent fallback on failure | 有 Key 才走模型，失败静默回退 |
| Vibes | `calm` · `punchy` · `dry` | 三种文风 |
| Ship | Print, copy, suggest `gh pr create`, or `--create` / `--update` / `--draft` | 打印、复制、建议命令，或开/更新 PR |
| Actions | `--github` annotations + job outputs + step summary; `--quiet` / `--max-annotations` | Actions 注解 + Job 输出 + Summary；可静音与限条 |
| HTML | `--html [path]` self-contained offline report (title / summary / body / vibe / stats) | `--html [path]` 离线自包含报告（标题 / 摘要 / 正文 / vibe / 统计） |

---

## Demo

```text
$ diff-vibe

  diff-vibe  ·  heuristic  ·  feat

  2 files  ·  +48  −2  ·  vs HEAD

    M  src/auth.ts     +40 −2
    A  src/session.ts  +8 −0

  proposed

    feat(auth): add logout and session

    ## Summary
    Add logout and session in auth. 2 files in this diff (+48 / −2).

    ## Changes
    - Update `src/auth.ts` (+40 −2)
    - Add `src/session.ts` (+8 −0)

    ## Test plan
    - Hit the happy path once — unit tests if you have them, otherwise a manual pass.

  next  diff-vibe --copy    or  diff-vibe --create
```

Pipe-friendly when stdout is not a TTY:

```bash
gh pr create --title "$(diff-vibe --title-only)" --body-file <(diff-vibe --body-only)
```

非 TTY 时可管道到 `gh`；默认看 HEAD 上的暂存 + 未暂存改动。

---

## Install · 安装

```bash
npm i -g @webywz/diff-vibe
npx @webywz/diff-vibe
```

Requires **Node.js 18.18+** and `git`. Package: [`@webywz/diff-vibe`](https://www.npmjs.com/package/@webywz/diff-vibe). Binary: `diff-vibe`.

需要 **Node.js 18.18+** 与 `git`。包名 `@webywz/diff-vibe`，命令仍是 `diff-vibe`。

---

## Quick start · 快速开始

### Single-run mode · 单次模式

```bash
diff-vibe                 # staged + unstaged vs HEAD
diff-vibe --base main     # vs merge-base of main (typical PR range)
diff-vibe --out pr.md     # write report to pr.md (stdout empty)
diff-vibe --out pr.json --json  # write JSON to both pr.json and stdout
diff-vibe --html          # self-contained HTML report on stdout
diff-vibe --html report.html  # write HTML to file (stdout empty)
diff-vibe --copy          # copy title + body when a clipboard exists
diff-vibe --open          # print a suggested `gh pr create` (does not post)
diff-vibe --create        # run `gh pr create` (needs `gh`)
diff-vibe --create --draft
diff-vibe --update        # edit open PR for this branch via `gh pr edit`
diff-vibe --github --quiet --base main   # Actions annotations (CI)
```

Default: **staged + unstaged vs `HEAD`** (`git diff HEAD`). For a PR draft, use `--base main` so commits already on the branch are included. Untracked files are invisible until `git add`.

默认对比 HEAD 上的暂存 + 未暂存。写 PR 用 `--base main`，把已提交的 commit 一并纳入。未跟踪文件需先 `git add`。

### Suite mode (batch) · 批处理模式

Process **multiple `.diff` files** in one run and get **aggregated JSON** with per-item results + stats:

一次处理**多个 `.diff` 文件**，输出**聚合 JSON**（每项结果 + 统计）：

```bash
diff-vibe --suite examples/suite/           # directory of .diff files
diff-vibe --suite "diffs/*.diff"            # glob pattern
diff-vibe --suite "examples/{a,b}/*.diff"   # brace expansion
diff-vibe --suite "suite/{good,bad}.diff"   # specific files with braces
diff-vibe --suite diffs/ --fail-above 0     # exit non-zero if any fail
diff-vibe --suite diffs/ --vibe punchy --locale zh
diff-vibe --suite diffs/ --out report.json  # write to file (stdout quiet)
diff-vibe --suite diffs/ --out report.json --json  # write to file + stdout
```

**Requirements · 要求:**

- **≥2 diff files** required (otherwise error) · 需要 ≥2 个 diff 文件（否则报错）
- Each `.diff` file = one diff pair · 每个 `.diff` 文件 = 一个 diff pair

**Output schema · 输出格式:**

```json
{
  "results": [
    {
      "file": "feat-auth.diff",
      "success": true,
      "proposal": { "title": "...", "body": "...", "type": "feat", ... }
    },
    {
      "file": "bad.diff",
      "success": false,
      "error": "Parse error: ..."
    }
  ],
  "stats": {
    "total": 2,
    "succeeded": 1,
    "failed": 1,
    "byType": { "feat": 1, "fix": 0, ... },
    "withBreaking": 0,
    "byEngine": { "heuristic": 1, "ai": 0 }
  }
}
```

**Fail gate · 失败闸门:**

`--fail-above <n>` (default: `0`) — exit code **1** when `stats.failed > n`.

`--fail-above <n>`（默认 `0`）— 当 `stats.failed > n` 时 exit 1。

**Examples · 示例:**

See [`examples/suite/`](./examples/suite/) for ready-to-run `.diff` files. Suite mode is ideal for CI batch validation, regression tests, or benchmarking proposal quality across many diffs.

参见 [`examples/suite/`](./examples/suite/) 获取可运行示例。批处理模式适合 CI 批量验证、回归测试或多 diff 提案质量基准。


### Pair with vibe-commit · 与 vibe-commit 成对

```bash
git add -p
npx --yes @webywz/vibe-commit --commit
npx --yes @webywz/diff-vibe@^0.1.8 --base main --create
```

Commits there · PRs here. Full walkthrough (EN/中文) and a copy-pasteable `gh` snippet live in [`examples/pair-workflow.md`](./examples/pair-workflow.md) and [`examples/gh-pr-create.sh`](./examples/gh-pr-create.sh). CI annotation sample: [`examples/github-actions.yml`](./examples/github-actions.yml). All ship in the npm tarball.

那边写 commit，这边写 PR。完整成对流程、可复制 `gh` 片段与 Actions 示例见 [`examples/`](./examples/)（随 npm 包一起发布）。

### Flags · 参数

| Flag | What it does · 作用 |
| --- | --- |
| `--base [ref]` | Diff vs merge-base of `<ref>`; omit ref to auto-detect `main` / `master` |
| `--suite <glob\|dir>` | **Batch mode**: process multiple `.diff` files → aggregated JSON with stats · **批处理模式**：处理多个 `.diff` 文件 → 聚合 JSON |
| `--fail-above <n>` | With `--suite`: exit non-zero if failed count > n (default: 0) · 配合 `--suite`：失败数 > n 时 exit 非 0 |
| `--title-only` | Title only · 只打印标题 |
| `--body-only` | Markdown body only · 只打印正文 |
| `--json` | Machine-readable proposal · 机器可读 |
| `--html [path]` | Self-contained HTML report (stdout, or write to path; offline, no CDN). Cannot share stdout with `--json` · 自包含 HTML 报告（stdout 或写入路径；离线、无 CDN）。不能与 `--json` 同时占用 stdout |
| `--out <file>` | Write report to file; with `--json`, write to both file and stdout · 写报告到文件；配合 `--json` 时同时写文件与 stdout |
| `--github` | Emit GitHub Actions `::notice` / `::warning` / `::error` annotations; write `GITHUB_OUTPUT` + `GITHUB_STEP_SUMMARY` when set · 输出 Actions 注解，并在环境变量存在时写 Job 输出与 Summary |
| `--quiet` | Suppress the pretty terminal report; `--json` / `--github` still emit · 抑制漂亮终端报告 |
| `--max-annotations <n>` | Cap `--github` annotation lines (default: 20; invalid → UsageError) · 限制注解条数 |
| `--copy` | Clipboard when available · 能复制就复制 |
| `--open` | Print suggested `gh pr create …` (no post) |
| `--create` | Run `gh pr create` · 真正开 PR（需本机有 `gh`） |
| `--update` | Edit open PR for this branch (`gh pr edit`) · 更新当前分支已开 PR；无 PR 时请用 `--create` |
| `--draft` | With `--create`, open a draft · 仅配合 `--create`；与 `--update` 互斥 |
| `--vibe <style>` | `calm` \| `punchy` \| `dry` (default: `calm`) |
| `--locale <locale>` | `en` \| `zh` (default: `en`) · PR title + body language · PR 标题与正文语言 |
| `--no-ai` | Skip the API even if a key is set · 有 Key 也不走 AI |
| `--no-color` | Disable ANSI colors in human-readable output (also respects `NO_COLOR` env) · 禁用彩色输出（也支持 `NO_COLOR` 环境变量） |
| `-h`, `--help` | Help |
| `-v`, `--version` | Version |

### Vibes · 文风

- **calm** — default. Imperative, review-ready, conventional. · 默认：专业祈使句，可直接贴进 PR
- **punchy** — a little personality, still safe. · 带一点俏皮
- **dry** — filler gone; sections stay, sentences shrink. · 更短

### Locale support · 语言支持

diff-vibe supports English (`en`, default) and Chinese (`zh`) PR titles and bodies:

diff-vibe 支持英文（`en`，默认）和中文（`zh`）的 PR 标题与正文：

```bash
diff-vibe --locale zh --base main        # Chinese PR: 添加/修复/更新...
diff-vibe --locale en --base main        # English PR: add/fix/update...
```

**Configuration precedence** · 配置优先级：
1. CLI flag `--locale`
2. Environment variable `VIBE_LOCALE` or `DIFF_VIBE_LOCALE`
3. Project config (`.diff-vibe.json` or `package.json#diffVibe`)
4. Default `en`

```json
// .diff-vibe.json
{
  "locale": "zh",
  "vibe": "calm"
}
```

```json
// package.json
{
  "diffVibe": {
    "locale": "zh",
    "vibe": "punchy"
  }
}
```

Both heuristic and AI engines respect the locale setting. The `--json` output includes a `locale` field.

启发式引擎和 AI 引擎都会遵循 locale 设置。`--json` 输出包含 `locale` 字段。

---

## How it works · 原理

1. Read staged + unstaged vs `HEAD`, or vs the merge-base of `--base`.
2. **Offline heuristic** (always on): paths + hunk keywords + added identifiers → `type`, `scope`, `subject`, then a body with **Summary**, **Changes**, **Test plan**.
   - `README` / `docs/` → `docs`
   - `*.test.ts` / `test/` → `test`
   - `.github/workflows` → `ci`
   - lockfiles / `package.json` → `chore`
   - `fix` / `bug` / `crash` in comments → `fix`
   - new files / `export function` → `feat`
3. If `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set, ask the model; **fall back to the heuristic** on any failure.
4. Print a proposal. `--open` only prints a command. `--create` / `--update` (opt-in) shell out to `gh` — nothing is posted or edited without those flags. `--create` and `--update` are mutually exclusive; `--draft` only pairs with `--create`.

启发式始终可用；配置了 API Key 才走模型，失败自动回退。`--create` 开新 PR，`--update` 编辑当前分支已开 PR；二者互斥。

---

## AI (optional) · 可选 AI

```bash
export OPENAI_API_KEY=sk-...
# optional:
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_BASE_URL=https://api.openai.com/v1   # any compatible gateway

# or:
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-3-5-haiku-latest

export DIFF_VIBE_VIBE=calm                # or VIBE
export DIFF_VIBE_LOCALE=zh                # or VIBE_LOCALE (default: en)
export NO_COLOR=1                         # disable ANSI colors (or use --no-color)
```

Keys are never required. Huge diffs are truncated before they leave the machine. No key / timeout / 4xx/5xx → silent fallback to the offline heuristic.

Set `NO_COLOR` (any non-empty value) or pass `--no-color` to disable ANSI colors in human-readable output. `--json` output is always plain JSON with no colors.

没 Key、超时、4xx/5xx → 静默回退到离线启发式，仍能给出可用草稿。

---

## Library · 库

```ts
import { proposeHeuristic, formatPr } from "@webywz/diff-vibe";

const proposal = proposeHeuristic({ diff, vibe: "calm" });
console.log(formatPr(proposal));
// feat(auth): add login
//
// ## Summary
// ...
```

Also useful: `proposePr`, `proposeWithAi`, `inspectDiff`, `suggestGhPrCreate`, `applyVibe`.

---

## Develop · 开发

```bash
git clone https://github.com/webywz/diff-vibe
cd diff-vibe
npm install
npm test
npm run build
node dist/cli.js --help
```

| Script | |
| --- | --- |
| `npm test` | Unit + e2e (`node:test` + `tsx`) |
| `npm run build` | Emit `dist/` (shebang + executable bit on `dist/cli.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prepublishOnly` | Build before publish |

---

## Links · 链接

- npm: [@webywz/diff-vibe](https://www.npmjs.com/package/@webywz/diff-vibe)
- Companion: [vibe-commit](https://github.com/webywz/vibe-commit)
- Pair workflow: [examples/pair-workflow.md](./examples/pair-workflow.md)
- GitHub Actions: [examples/github-actions.yml](./examples/github-actions.yml)
- License: [MIT](./LICENSE) © webywz
