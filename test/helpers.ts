import type { DiffFile, DiffHunk, FileStatus, GitDiff } from "../src/types.ts";

export function diffFile(
  partial: Partial<DiffFile> & { path: string },
): DiffFile {
  return {
    status: "M",
    additions: 8,
    deletions: 2,
    ...partial,
  };
}

export function hunk(path: string, lines: string[]): DiffHunk {
  return {
    path,
    header: "@@ -1,3 +1,6 @@",
    lines,
  };
}

export function gitDiff(
  files: DiffFile[],
  hunks: DiffHunk[] = [],
  raw = "",
): GitDiff {
  return { files, hunks, raw };
}

export function addedLines(path: string, source: string): DiffHunk {
  const lines = source.split("\n").map((line) => `+${line}`);
  return hunk(path, lines);
}

export const statuses = {
  add: "A" as FileStatus,
  modify: "M" as FileStatus,
  delete: "D" as FileStatus,
  rename: "R" as FileStatus,
};
