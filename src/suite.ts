import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { proposePr } from "./propose.ts";
import { parseUnifiedDiff } from "./parse-diff.ts";
import type {
  SuiteResult,
  SuiteItemResult,
  SuiteStats,
  CommitType,
  Engine,
  Vibe,
  Locale,
} from "./types.ts";

export interface SuiteOptions {
  pattern: string;
  vibe: Vibe;
  locale: Locale;
  preferAi?: boolean;
}

export async function runSuite(
  options: SuiteOptions,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<SuiteResult> {
  const diffFiles = resolveDiffFiles(options.pattern, cwd);

  if (diffFiles.length < 2) {
    throw new Error(
      `Suite mode requires ≥2 diff files, found ${diffFiles.length}. ` +
        `Pattern: "${options.pattern}"`,
    );
  }

  const results: SuiteItemResult[] = [];

  for (const file of diffFiles) {
    try {
      const raw = readFileSync(file, "utf8");
      const diff = parseDiffFile(raw);
      const proposal = await proposePr(
        diff,
        {
          vibe: options.vibe,
          locale: options.locale,
          preferAi: options.preferAi,
        },
        env,
      );
      results.push({
        file: relative(cwd, file),
        success: true,
        proposal,
      });
    } catch (error) {
      results.push({
        file: relative(cwd, file),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const stats = computeStats(results);

  return { results, stats };
}

export function resolveDiffFiles(pattern: string, cwd: string): string[] {
  const absPattern = isAbsolute(pattern) ? pattern : join(cwd, pattern);

  try {
    const stats = statSync(absPattern);
    if (stats.isDirectory()) {
      return findDiffsInDirectory(absPattern);
    }
    if (stats.isFile() && absPattern.endsWith(".diff")) {
      return [absPattern];
    }
  } catch {
    // Not a valid path, try as glob
  }

  return findDiffsByGlob(pattern, cwd);
}

function findDiffsInDirectory(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const diffs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".diff")) {
      diffs.push(fullPath);
    } else if (entry.isDirectory()) {
      diffs.push(...findDiffsInDirectory(fullPath));
    }
  }

  return diffs.sort();
}

function findDiffsByGlob(pattern: string, cwd: string): string[] {
  const absPattern = isAbsolute(pattern) ? pattern : join(cwd, pattern);
  
  let searchDir = "";
  let remaining = "";

  if (isAbsolute(pattern)) {
    const parts = pattern.split("/").filter(Boolean);
    let dir = "/";
    let idx = 0;
    for (const part of parts) {
      if (part.includes("*") || part.includes("?")) {
        remaining = parts.slice(idx).join("/");
        break;
      }
      dir = join(dir, part);
      idx++;
    }
    searchDir = dir === "/" ? "/" : dir;
    if (!remaining) remaining = parts[parts.length - 1] ?? "";
  } else {
    searchDir = cwd;
    remaining = pattern;
  }

  try {
    statSync(searchDir);
  } catch {
    return [];
  }

  const allDiffs = findDiffsInDirectory(searchDir);
  const regex = globToRegex(remaining);

  return allDiffs
    .filter((file) => {
      const rel = relative(searchDir, file);
      return regex.test(rel);
    })
    .sort();
}

function globToRegex(pattern: string): RegExp {
  let regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
  regexStr = `^${regexStr}$`;
  return new RegExp(regexStr);
}

function parseDiffFile(raw: string): import("./types.ts").GitDiff {
  const files = new Map<string, import("./types.ts").DiffFile>();
  let currentPath: string | undefined;
  let currentFromPath: string | undefined;
  let currentStatus: import("./types.ts").FileStatus = "M";

  for (const line of raw.split("\n")) {
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffMatch) {
      currentPath = diffMatch[2];
      currentFromPath = undefined;
      currentStatus = "M";
      continue;
    }

    if (line.match(/^new file mode/)) {
      currentStatus = "A";
      continue;
    }

    if (line.match(/^deleted file mode/)) {
      currentStatus = "D";
      continue;
    }

    if (line.match(/^rename from/)) {
      const match = line.match(/^rename from (.+)$/);
      if (match) currentFromPath = match[1];
      currentStatus = "R";
      continue;
    }

    const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusMatch && plusMatch[1] !== "/dev/null") {
      currentPath = plusMatch[1];
      if (currentPath && !files.has(currentPath)) {
        files.set(currentPath, {
          path: currentPath,
          fromPath: currentFromPath,
          status: currentStatus,
          additions: 0,
          deletions: 0,
        });
      }
      continue;
    }

    if (currentPath && (line.startsWith("+") && !line.startsWith("+++"))) {
      const file = files.get(currentPath);
      if (file) file.additions++;
    } else if (currentPath && (line.startsWith("-") && !line.startsWith("---"))) {
      const file = files.get(currentPath);
      if (file) file.deletions++;
    }
  }

  const hunks = parseUnifiedDiff(raw);
  const filesList = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));

  if (filesList.length === 0 && hunks.length === 0) {
    throw new Error("Invalid or empty diff file");
  }

  return {
    files: filesList,
    hunks,
    raw,
  };
}

function computeStats(results: SuiteItemResult[]): SuiteStats {
  const stats: SuiteStats = {
    total: results.length,
    succeeded: 0,
    failed: 0,
    byType: {
      feat: 0,
      fix: 0,
      docs: 0,
      style: 0,
      refactor: 0,
      perf: 0,
      test: 0,
      build: 0,
      ci: 0,
      chore: 0,
    },
    withBreaking: 0,
    byEngine: {
      heuristic: 0,
      ai: 0,
    },
  };

  for (const result of results) {
    if (result.success && result.proposal) {
      stats.succeeded++;
      stats.byType[result.proposal.type]++;
      if (result.proposal.breaking) {
        stats.withBreaking++;
      }
      stats.byEngine[result.proposal.engine]++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}
