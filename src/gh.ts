import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { suggestGhPrCreate } from "./format.ts";

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

const defaultRunner: GhRunner = (command, args) =>
  spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** Opt-in: run `gh pr create`. Never called unless `--create`. */
export function createPrWithGh(input: CreatePrInput): CreatePrResult {
  const suggestedCommand = suggestGhPrCreate(input.title, input.body);
  const runner = input.runner ?? defaultRunner;
  const args = ["pr", "create", "--title", input.title, "--body", input.body];
  if (input.draft) args.push("--draft");

  let result: SpawnSyncReturns<string>;
  try {
    result = runner("gh", args);
  } catch (error) {
    return {
      ok: false,
      suggestedCommand,
      message:
        error instanceof Error
          ? `failed to spawn gh: ${error.message}`
          : "failed to spawn gh",
    };
  }

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        suggestedCommand,
        message: "gh not found on PATH — install GitHub CLI, or run the suggested command yourself",
      };
    }
    return {
      ok: false,
      suggestedCommand,
      message: `gh failed to start: ${result.error.message}`,
    };
  }

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  if (result.status === 0) {
    const url = stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => /^https?:\/\//.test(l));
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
