import { execFileSync } from "node:child_process";
import { assembleDiff } from "./parse-diff.ts";
import type { InspectedDiff } from "./types.ts";

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

export function inspectDiff(
  cwd = process.cwd(),
  base?: string,
): InspectedDiff {
  assertRepo(cwd);
  const resolved = resolveDiffRange(cwd, base);
  const args = ["diff", "-M", resolved.range];
  const nameStatus = git([...args, "--name-status"], cwd);
  const numstat = git([...args, "--numstat"], cwd);
  const raw = git([...args, "--unified=3"], cwd);
  const diff = assembleDiff(nameStatus, numstat, raw);
  if (diff.files.length === 0) {
    throw new GitError(
      resolved.baseRef
        ? `No changes vs ${resolved.rangeLabel}. Nothing to describe.`
        : "No changes vs HEAD. Commit something, or pass --base main.",
    );
  }
  return { diff, rangeLabel: resolved.rangeLabel, baseRef: resolved.baseRef };
}

export function assertRepo(cwd = process.cwd()): void {
  try {
    const inside = git(["rev-parse", "--is-inside-work-tree"], cwd).trim();
    if (inside !== "true") throw new Error("not a repo");
  } catch {
    throw new GitError(
      "Not a git repository. Run this inside a project with git.",
    );
  }
}

export function detectDefaultBranch(cwd = process.cwd()): string {
  try {
    const symbolic = git(
      ["rev-parse", "--abbrev-ref", "origin/HEAD"],
      cwd,
    ).trim();
    if (symbolic && symbolic !== "origin/HEAD") return symbolic;
  } catch {
    // no origin
  }
  for (const candidate of ["main", "master", "origin/main", "origin/master"]) {
    try {
      git(["rev-parse", "--verify", candidate], cwd);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new GitError("Cannot detect main or master. Pass --base <ref>.");
}

export function resolveDiffRange(
  cwd: string,
  base?: string,
): { range: string; rangeLabel: string; baseRef?: string } {
  if (!base) {
    assertHead(cwd);
    return { range: "HEAD", rangeLabel: "HEAD" };
  }
  const ref = base === "auto" ? detectDefaultBranch(cwd) : base;
  try {
    git(["rev-parse", "--verify", ref], cwd);
  } catch {
    throw new GitError(`Unknown --base ref "${ref}".`);
  }
  try {
    const mergeBase = git(["merge-base", "HEAD", ref], cwd).trim();
    const short = git(["rev-parse", "--short", mergeBase], cwd).trim();
    return {
      range: mergeBase,
      rangeLabel: `merge-base of ${ref} (${short})`,
      baseRef: ref,
    };
  } catch {
    throw new GitError(`Cannot find merge-base with "${ref}".`);
  }
}

function assertHead(cwd: string): void {
  try {
    git(["rev-parse", "--verify", "HEAD"], cwd);
  } catch {
    throw new GitError(
      "This repository has no commits yet. Create an initial commit first.",
    );
  }
}

export function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : "";
    const detail =
      stderr.trim() ||
      (error instanceof Error ? error.message : "git failed");
    throw new GitError(detail);
  }
}
