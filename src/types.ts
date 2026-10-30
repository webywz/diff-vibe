export const VIBES = ["calm", "punchy", "dry"] as const;
export type Vibe = (typeof VIBES)[number];

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

export type FileStatus = "A" | "M" | "D" | "R" | "C" | "T" | "U";

export interface DiffFile {
  path: string;
  fromPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  path: string;
  header: string;
  lines: string[];
}

export interface GitDiff {
  files: DiffFile[];
  hunks: DiffHunk[];
  raw: string;
}

export type Engine = "heuristic" | "ai";

export interface ProposedPr {
  title: string;
  body: string;
  type: CommitType;
  scope?: string;
  subject: string;
  summary: string;
  changes: string[];
  testPlan: string[];
  breaking: boolean;
  engine: Engine;
}

export interface ProposeOptions {
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  preferAi?: boolean;
}

export interface InspectedDiff {
  diff: GitDiff;
  rangeLabel: string;
  baseRef?: string;
}

export interface CliOptions {
  base?: string;
  titleOnly: boolean;
  bodyOnly: boolean;
  json: boolean;
  github: boolean;
  quiet: boolean;
  maxAnnotations: number;
  copy: boolean;
  open: boolean;
  create: boolean;
  update: boolean;
  draft: boolean;
  vibe: Vibe;
  noAi: boolean;
  help: boolean;
  version: boolean;
}
