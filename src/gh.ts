import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { suggestGhPrCreate, suggestGhPrEdit } from "./format.ts";

export type GhRunner = (
  command: string,
  args: string[],
) => SpawnSyncReturns<string>;

export interface CreatePrInput {
  title: string;
  body: string;
  draft?: boolean;
  runner?: GhRunner;
}

export interface CreatePrResult {
  ok: boolean;
  url?: string;
  message: string;
  suggestedCommand: string;
}

export interface UpdatePrInput {
  title: string;
  body: string;
  runner?: GhRunner;
}

export type UpdatePrResult = CreatePrResult;

const defaultRunner: GhRunner = (command, args) =>
  spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function runGh(
  runner: GhRunner,
  args: string[],
  suggestedCommand: string,
):
  | { ok: true; result: SpawnSyncReturns<string> }
  | { ok: false; result: CreatePrResult } {
  let result: SpawnSyncReturns<string>;
  try {
    result = runner("gh", args);
  } catch (error) {
    return {
      ok: false,
      result: {
        ok: false,
        suggestedCommand,
        message:
          error instanceof Error
            ? `failed to spawn gh: ${error.message}`
            : "failed to spawn gh",
      },
    };
  }

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        result: {
          ok: false,
          suggestedCommand,
          message:
            "gh not found on PATH — install GitHub CLI, or run the suggested command yourself",
        },
      };
    }
    return {
      ok: false,
      result: {
        ok: false,
        suggestedCommand,
        message: `gh failed to start: ${result.error.message}`,
      },
    };
  }

  return { ok: true, result };
}

function extractUrl(stdout: string): string | undefined {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//.test(l));
}

function parsePrViewUrl(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as { url?: unknown };
    return typeof parsed.url === "string" && /^https?:\/\//.test(parsed.url)
      ? parsed.url
      : undefined;
  } catch {
    return extractUrl(trimmed);
  }
}

/** Opt-in: run `gh pr create`. Never called unless `--create`. */
export function createPrWithGh(input: CreatePrInput): CreatePrResult {
  const suggestedCommand = suggestGhPrCreate(input.title, input.body);
  const runner = input.runner ?? defaultRunner;
  const args = ["pr", "create", "--title", input.title, "--body", input.body];
  if (input.draft) args.push("--draft");

  const spawned = runGh(runner, args, suggestedCommand);
  if (!spawned.ok) return spawned.result;
  const result = spawned.result;

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  if (result.status === 0) {
    const url = extractUrl(stdout);
    return {
      ok: true,
      url,
      suggestedCommand,
      message: url ? `opened ${url}` : stdout || "pull request created",
    };
  }

  return {
    ok: false,
    suggestedCommand,
    message:
      stderr ||
      stdout ||
      `gh pr create exited with code ${result.status ?? "unknown"}`,
  };
}

/**
 * Opt-in: edit the open PR for the current branch via `gh pr edit`.
 * Never called unless `--update`. Fails clearly when no open PR exists.
 */
export function updatePrWithGh(input: UpdatePrInput): UpdatePrResult {
  const createHint = suggestGhPrCreate(input.title, input.body);
  const editHint = suggestGhPrEdit(input.title, input.body);
  const runner = input.runner ?? defaultRunner;

  const viewed = runGh(runner, ["pr", "view", "--json", "url"], createHint);
  if (!viewed.ok) return viewed.result;
  const viewResult = viewed.result;
  const viewStdout = (viewResult.stdout ?? "").trim();
  const viewStderr = (viewResult.stderr ?? "").trim();

  if (viewResult.status !== 0) {
    const detail = viewStderr || viewStdout;
    const noPr =
      /no pull requests? found/i.test(detail) ||
      /could not find/i.test(detail) ||
      /no open/i.test(detail) ||
      detail.length === 0;
    return {
      ok: false,
      suggestedCommand: createHint,
      message: noPr
        ? "no open pull request for this branch — use --create"
        : detail ||
          `gh pr view exited with code ${viewResult.status ?? "unknown"}`,
    };
  }

  const url = parsePrViewUrl(viewStdout);
  if (!url) {
    return {
      ok: false,
      suggestedCommand: createHint,
      message: "no open pull request for this branch — use --create",
    };
  }

  const edited = runGh(
    runner,
    ["pr", "edit", "--title", input.title, "--body", input.body],
    editHint,
  );
  if (!edited.ok) return edited.result;
  const editResult = edited.result;
  const editStdout = (editResult.stdout ?? "").trim();
  const editStderr = (editResult.stderr ?? "").trim();

  if (editResult.status === 0) {
    const editedUrl = extractUrl(editStdout) ?? url;
    return {
      ok: true,
      url: editedUrl,
      suggestedCommand: editHint,
      message: `updated ${editedUrl}`,
    };
  }

  return {
    ok: false,
    suggestedCommand: editHint,
    message:
      editStderr ||
      editStdout ||
      `gh pr edit exited with code ${editResult.status ?? "unknown"}`,
  };
}
