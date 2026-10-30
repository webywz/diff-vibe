import { VIBES, LOCALES, type CliOptions, type Vibe, type Locale } from "./types.ts";
import { resolveLocale, resolveVibe } from "./config.ts";

const HELP = `diff-vibe — stylish PR titles + bodies from a git diff, offline-first
把 git diff 写成有品味的 PR title + body（离线优先）

Usage · 用法
  diff-vibe [options]

Options · 参数
  --base [ref]              Diff vs merge-base of <ref> (default ref: main/master)
  --title-only              Print the title only · 只打印标题
  --body-only               Print the markdown body only · 只打印正文
  --json                    Print a machine-readable proposal · 机器可读
  --github                  Emit GitHub Actions annotations (::notice/warning/error)
                            输出 Actions 注解；有 GITHUB_OUTPUT / GITHUB_STEP_SUMMARY 时写输出与 Job Summary
  --quiet                   Suppress the pretty terminal report (--json / --github still emit)
                            抑制漂亮终端报告；--json / --github 仍照常
  --max-annotations <n>     Cap GitHub annotation lines (default: 20) · 限制注解条数
  --copy                    Copy the output to the clipboard when available
  --open                    Print a suggested \`gh pr create\` command
  --create                  Run \`gh pr create\` (needs \`gh\`)
  --update                  Edit the open PR for this branch via \`gh pr edit\`
  --draft                   With --create, open as a draft
  --vibe <style>            calm | punchy | dry            (default: calm)
  --locale <locale>         en | zh                        (default: en)
                            PR title + body language · PR 标题与正文语言
  --no-ai                   Skip AI even if an API key is set
  -h, --help                Show help
  -v, --version             Show version

Env
  OPENAI_API_KEY / ANTHROPIC_API_KEY   Optional. Never required
  OPENAI_MODEL         Default: gpt-4o-mini
  OPENAI_BASE_URL      Default: https://api.openai.com/v1
  ANTHROPIC_MODEL      Default: claude-3-5-haiku-latest
  VIBE / DIFF_VIBE_VIBE      Default vibe when --vibe is omitted
  VIBE_LOCALE / DIFF_VIBE_LOCALE   Default locale when --locale is omitted

With --github, annotations go to stdout (or stderr when combined with --json) so
PR Checks can surface the proposed title / summary / changes. Job outputs
title/summary/type/breaking/engine/base/findings are written when GITHUB_OUTPUT
is set (findings = changes.length). A short Markdown job summary is appended when
GITHUB_STEP_SUMMARY is set. --quiet hides the pretty report only.

配合 --github 时注解走 stdout（与 --json 联用则走 stderr，保持 JSON 干净）。
有 GITHUB_OUTPUT 时写入 title/summary 等字段；有 GITHUB_STEP_SUMMARY 时追加 Job Summary。
--quiet 只隐藏漂亮终端报告。

Examples · 示例
  diff-vibe
  diff-vibe --base main --vibe punchy
  diff-vibe --json
  diff-vibe --github --quiet --base main
  diff-vibe --github --json --max-annotations 10
  diff-vibe --open
  diff-vibe --create
  diff-vibe --create --draft
  diff-vibe --update
`;

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CliOptions {
  const options: CliOptions = {
    titleOnly: false,
    bodyOnly: false,
    json: false,
    github: false,
    quiet: false,
    maxAnnotations: 20,
    copy: false,
    open: false,
    create: false,
    update: false,
    draft: false,
    vibe: resolveVibe(env, cwd),
    locale: resolveLocale(env, cwd),
    noAi: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--title-only") {
      options.titleOnly = true;
      continue;
    }
    if (arg === "--body-only") {
      options.bodyOnly = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--github") {
      options.github = true;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--max-annotations" || arg.startsWith("--max-annotations=")) {
      const value = arg.includes("=")
        ? arg.slice("--max-annotations=".length)
        : argv[++i];
      options.maxAnnotations = parseMaxAnnotations(value);
      continue;
    }
    if (arg === "--copy") {
      options.copy = true;
      continue;
    }
    if (arg === "--open") {
      options.open = true;
      continue;
    }
    if (arg === "--create") {
      options.create = true;
      continue;
    }
    if (arg === "--update") {
      options.update = true;
      continue;
    }
    if (arg === "--draft") {
      options.draft = true;
      continue;
    }
    if (arg === "--no-ai") {
      options.noAi = true;
      continue;
    }
    if (arg === "--base" || arg.startsWith("--base=")) {
      if (arg.startsWith("--base=")) {
        const value = arg.slice("--base=".length).trim();
        if (!value) throw new UsageError("Missing value for --base");
        options.base = value;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options.base = next;
        i += 1;
      } else {
        options.base = "auto";
      }
      continue;
    }
    if (arg === "--vibe" || arg.startsWith("--vibe=")) {
      const value = arg.includes("=") ? arg.slice("--vibe=".length) : argv[++i];
      options.vibe = parseVibe(value);
      continue;
    }
    if (arg === "--locale" || arg.startsWith("--locale=")) {
      const value = arg.includes("=") ? arg.slice("--locale=".length) : argv[++i];
      options.locale = parseLocale(value);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    throw new UsageError(`Unexpected argument: ${arg}`);
  }

  if (options.titleOnly && options.bodyOnly) {
    throw new UsageError("Use only one of --title-only or --body-only");
  }
  if (options.create && options.update) {
    throw new UsageError("Use only one of --create or --update");
  }
  if (options.draft && !options.create) {
    throw new UsageError("--draft requires --create");
  }

  return options;
}

export function parseMaxAnnotations(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) throw new UsageError("Missing value for --max-annotations");
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new UsageError("--max-annotations must be a positive integer");
  }
  return n;
}

export function parseVibe(value: string | undefined): Vibe {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --vibe");
  if (!(VIBES as readonly string[]).includes(raw)) {
    throw new UsageError(`Invalid --vibe "${value}". Use: ${VIBES.join(", ")}`);
  }
  return raw as Vibe;
}

export function parseLocale(value: string | undefined): Locale {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --locale");
  if (!(LOCALES as readonly string[]).includes(raw)) {
    throw new UsageError(`Invalid --locale "${value}". Use: ${LOCALES.join(", ")}`);
  }
  return raw as Locale;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function helpText(): string {
  return HELP;
}
