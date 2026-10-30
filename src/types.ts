export const VIBES = ["calm", "punchy", "dry"] as const;
export type Vibe = (typeof VIBES)[number];

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

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
  locale: Locale;
}

export interface ProposeOptions {
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  locale: Locale;
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
  out?: string;
  vibe: Vibe;
  locale: Locale;
  noAi: boolean;
  help: boolean;
  version: boolean;
  suite?: string;
  failAbove?: number;
}

export interface SuiteItemResult {
  file: string;
  success: boolean;
  proposal?: ProposedPr;
  error?: string;
}

export interface SuiteStats {
  total: number;
  succeeded: number;
  failed: number;
  byType: Record<CommitType, number>;
  withBreaking: number;
  byEngine: Record<Engine, number>;
}

export interface SuiteResult {
  results: SuiteItemResult[];
  stats: SuiteStats;
}
