# diff-vibe

**Stylish PR titles and bodies from a git diff. Offline-first. AI-optional.**

Companion to [vibe-commit](https://github.com/webywz/vibe-commit): one command, the current diff, a review-ready pull request draft.

一条命令，把当前 git diff 写成有品味的 PR **title** + **body**。**无 API Key 也能用**，有 Key 时再可选 AI。

[![CI](https://github.com/webywz/diff-vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/webywz/diff-vibe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@webywz/diff-vibe.svg)](https://www.npmjs.com/package/@webywz/diff-vibe)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

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

---

## Install · 安装

```bash
npm i -g @webywz/diff-vibe
npx @webywz/diff-vibe
```

Requires **Node.js 18.18+** and `git`. After install, the CLI binary is still `diff-vibe`.

```bash
npm i -g @webywz/diff-vibe          # 全局安装
npx @webywz/diff-vibe               # 一次性运行
```

---

## Usage · 用法

```bash
diff-vibe                 # staged + unstaged vs HEAD
diff-vibe --base main     # vs merge-base of main (typical PR range)
diff-vibe --copy          # also copy title + body when a clipboard exists
diff-vibe --open          # print a suggested `gh pr create` command (does not post)
diff-vibe --create        # run `gh pr create` with the proposal (needs gh)
diff-vibe --create --draft
```

| Flag | What it does · 作用 |
| --- | --- |
| `--base [ref]` | Diff vs merge-base of `<ref>`. Omit the ref to auto-detect `main` / `master` |
| `--title-only` | Print the title only · 只打印标题 |
| `--body-only` | Print the markdown body only · 只打印正文 |
| `--json` | Machine-readable proposal |
| `--copy` | Copy output to the clipboard when available · 能复制就复制 |
| `--open` | Print a suggested `gh pr create …` command (does not post) |
| `--create` | Run `gh pr create` with the proposal · 真正开 PR（需本机有 `gh`） |
| `--draft` | With `--create`, open a draft PR · 配合 `--create` 开草稿 |
| `--vibe <style>` | `calm` \| `punchy` \| `dry` (default: `calm`) |
| `--no-ai` | Skip the API even if a key is set |
| `-h`, `--help` | Help |
| `-v`, `--version` | Version |

默认看 **HEAD 上的暂存 + 未暂存改动**（`git diff HEAD`）。写 PR 时用 `--base main`，对比当前分支和主支的 merge-base，连已提交的 commit 一起纳入。未跟踪文件不会出现在 diff 里，需要的话先 `git add`。

### Vibes

- **calm** — default. Imperative, review-ready, conventional.
- **punchy** — a little personality, still safe for a real repo.
- **dry** — filler words gone; sections stay, sentences shrink.

默认 **calm**：专业、祈使句、可直接贴进 PR。`punchy` 带一点俏皮；`dry` 更短。

---

## How it works · 原理

1. Read **staged + unstaged** changes vs `HEAD`, or vs the merge-base of `--base`.
2. **Offline heuristic** (always on): file paths + hunk keywords + added identifiers → `type`, `scope`, `subject`, then a markdown body with **Summary**, **Changes**, and **Test plan**.
   - `README` / `docs/` → `docs`
   - `*.test.ts` / `test/` → `test`
   - `.github/workflows` → `ci`
   - lockfiles / `package.json` → `chore`
   - `fix` / `bug` / `crash` in comments → `fix`
   - new files / `export function` → `feat`
3. If `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set, ask the model and **fall back to the heuristic** on any failure.
4. Print a proposal. `--open` only prints a `gh pr create` command. `--create` (opt-in) shells out to `gh pr create` — nothing is posted without that flag.

启发式始终可用；配置了 API Key 才走模型，失败自动回退。

---

## AI (optional)

```bash
export OPENAI_API_KEY=sk-...
# optional:
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_BASE_URL=https://api.openai.com/v1   # any compatible gateway

# or:
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-3-5-haiku-latest

export DIFF_VIBE_VIBE=calm
```

Copy `.env.example` if you keep secrets in a file. Keys are never required. Huge diffs are truncated before they leave the machine.

没 Key、超时、4xx/5xx → 静默回退到离线启发式，CLI 仍然能给出一份能用的草稿。

---

## Library

```ts
import { proposeHeuristic, formatPr } from "@webywz/diff-vibe";

const proposal = proposeHeuristic({ diff, vibe: "calm" });
console.log(formatPr(proposal));
// feat(auth): add login
//
// ## Summary
// ...
```

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
| `npm test` | Unit + e2e tests (`node:test` + `tsx`) |
| `npm run build` | Emit `dist/` (shebang + executable bit on `dist/cli.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prepublishOnly` | Build before publish |

MIT © webywz — see [LICENSE](./LICENSE).
