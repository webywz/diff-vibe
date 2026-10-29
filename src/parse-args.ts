import { VIBES, type CliOptions, type Vibe } from "./types.ts";

const HELP = `diff-vibe — stylish PR titles + bodies from a git diff, offline-first

Usage
  diff-vibe [options]

Options
  --base [ref]        Diff vs merge-base of <ref> (default ref: main/master)
  --title-only        Print the title only
  --body-only         Print the markdown body only
  --json              Print a machine-readable proposal
  --copy              Copy the output to the clipboard when available
  --open              Print a suggested \`gh pr create\` command
  --vibe <style>      calm | punchy | dry            (default: calm)
  --no-ai             Skip AI even if an API key is set
  -h, --help          Show help
  -v, --version       Show version

Env
  OPENAI_API_KEY / ANTHROPIC_API_KEY   Optional. Never required
  OPENAI_MODEL         Default: gpt-4o-mini
  OPENAI_BASE_URL      Default: https://api.openai.com/v1
  ANTHROPIC_MODEL      Default: claude-3-5-haiku-latest
  VIBE / DIFF_VIBE_VIBE   Default vibe when --vibe is omitted

Examples
  diff-vibe
  diff-vibe --base main --vibe punchy
  diff-vibe --json
  diff-vibe --open
`;

export function defaultVibeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Vibe {
  const raw = (env.DIFF_VIBE_VIBE ?? env.VIBE ?? "calm").trim().toLowerCase();
  return (VIBES as readonly string[]).includes(raw) ? (raw as Vibe) : "calm";
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const options: CliOptions = {
    titleOnly: false,
    bodyOnly: false,
    json: false,
    copy: false,
    open: false,
    vibe: defaultVibeFromEnv(env),
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
    if (arg === "--copy") {
      options.copy = true;
      continue;
    }
    if (arg === "--open") {
      options.open = true;
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
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    throw new UsageError(`Unexpected argument: ${arg}`);
  }

  if (options.titleOnly && options.bodyOnly) {
    throw new UsageError("Use only one of --title-only or --body-only");
  }

  return options;
}

export function parseVibe(value: string | undefined): Vibe {
  const raw = value?.trim().toLowerCase();
  if (!raw) throw new UsageError("Missing value for --vibe");
  if (!(VIBES as readonly string[]).includes(raw)) {
    throw new UsageError(`Invalid --vibe "${value}". Use: ${VIBES.join(", ")}`);
  }
  return raw as Vibe;
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
