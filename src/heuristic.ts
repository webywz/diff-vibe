import { formatBody, formatTitle, normalizeSubject } from "./format.ts";
import type {
  CommitType,
  DiffFile,
  DiffHunk,
  GitDiff,
  Locale,
  ProposedPr,
  Vibe,
} from "./types.ts";
import { applyVibe } from "./vibe.ts";

const SKIP_SCOPE_DIRS = new Set([
  ".",
  "src",
  "lib",
  "app",
  "apps",
  "dist",
  "build",
  "source",
  "sources",
  "packages",
  "test",
  "tests",
  "__tests__",
  "bin",
  "scripts",
]);

const IDENT_RE =
  /^\+\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub(?:lic|\(crate\))?\s+)?(?:function|const|let|class|type|interface|enum|fn|struct|trait|impl|def|func)\s+([A-Za-z_][\w]*)/;

const FIX_WORD_RE =
  /\b(fix|fixed|fixes|bug|bugs|hotfix|crash|broken|error|regression|issue|#\d+)\b/i;
const FEAT_WORD_RE =
  /\b(add|added|feat|feature|implement|introduce|support|enable)\b/i;
const REFACTOR_WORD_RE =
  /\b(refactor|rename|move|extract|simplify|cleanup|clean up|restructure)\b/i;
const PERF_WORD_RE =
  /\b(perf|performance|optimiz|cache|faster|speed)\b/i;

const VERBS_ZH: Record<string, string> = {
  add: "添加",
  update: "更新",
  fix: "修复",
  remove: "移除",
  rename: "重命名",
  refactor: "重构",
  improve: "改进",
  format: "格式化",
};

const WORDS_ZH: Record<string, string> = {
  to: "为",
  and: "与",
  tests: "测试",
  performance: "性能",
  workflow: "工作流",
  build: "构建",
  dependencies: "依赖",
  readme: "说明文档",
  "initial implementation": "初始实现",
};

export interface HeuristicInput {
  diff: GitDiff;
  type?: CommitType;
  scope?: string;
  vibe: Vibe;
  locale: Locale;
}

export function proposeHeuristic(input: HeuristicInput): ProposedPr {
  const { diff, vibe, locale } = input;
  const type = input.type ?? inferType(diff);
  const scope = input.scope ?? inferScope(diff.files);
  const subject = inferSubject(diff, type, scope, locale);
  const breaking = inferBreaking(diff);
  const summary = inferSummary(diff, type, subject, scope, locale);
  const styled = applyVibe(
    { type, scope, subject, summary, breaking },
    vibe,
  );
  const changes = inferChanges(diff.files, vibe, locale);
  const testPlan = inferTestPlan(diff, type, locale);
  const title = formatTitle(styled);
  const body = formatBody({
    summary: styled.summary,
    changes,
    testPlan,
  });
  return {
    title,
    body,
    type: styled.type,
    scope: styled.scope,
    subject: styled.subject,
    summary: styled.summary,
    changes,
    testPlan,
    breaking: styled.breaking,
    engine: "heuristic",
    locale,
  };
}

export function inferType(diff: GitDiff): CommitType {
  const files = diff.files;
  if (files.length === 0) return "chore";

  const roles = files.map((file) => primaryRole(file.path));
  const unique = new Set(roles);
  const keyword = keywordType(diff);

  if (unique.size === 1) {
    const role = roles[0] ?? "chore";
    if (role !== "feat") return role;
    if (files.every((file) => file.status === "R")) return "refactor";
    return keyword ?? "feat";
  }

  if (keyword === "fix" || keyword === "perf" || keyword === "refactor") {
    return keyword;
  }

  const codeRoles = roles.filter(
    (role) => role === "feat" || role === "style" || role === "build",
  );
  if (codeRoles.length > 0) return "feat";
  if (roles.includes("test")) return "test";
  if (roles.includes("ci")) return "ci";
  if (roles.includes("docs")) return "docs";
  return "chore";
}

export function primaryRole(path: string): CommitType {
  if (isTestPath(path)) return "test";
  if (isCiPath(path)) return "ci";
  if (isDocsPath(path)) return "docs";
  if (isBuildPath(path)) return "build";
  if (isChorePath(path)) return "chore";
  if (isStylePath(path)) return "style";
  return "feat";
}

export function classifyPath(path: string): CommitType[] {
  return [primaryRole(path)];
}

export function isTestPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|spec)\//i.test(path) ||
    /\.(tests?|spec)\.[cm]?[jt]sx?$/i.test(path)
  );
}

export function isCiPath(path: string): boolean {
  return /(^|\/)(\.github\/workflows|\.gitlab-ci|\.circleci)(\/|$)/i.test(path);
}

export function isDocsPath(path: string): boolean {
  return (
    /(^|\/)(docs?|documentation)\//i.test(path) ||
    /\.(md|mdx|rst|adoc)$/i.test(path) ||
    /readme/i.test(path)
  );
}

export function isBuildPath(path: string): boolean {
  return /(^|\/)(Dockerfile|Makefile|webpack\.|vite\.config|rollup\.config|tsup\.config|esbuild)/i.test(
    path,
  );
}

export function isChorePath(path: string): boolean {
  return /(^|\/)(\.gitignore|\.editorconfig|\.nvmrc|eslint|prettier|tsconfig|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)(\b|$)/i.test(
    path,
  );
}

function isStylePath(path: string): boolean {
  return /\.(css|scss|sass|less)$/i.test(path);
}

function keywordType(diff: GitDiff): CommitType | undefined {
  const blob = keywordCorpus(diff);
  if (FIX_WORD_RE.test(blob)) return "fix";
  if (PERF_WORD_RE.test(blob)) return "perf";
  if (REFACTOR_WORD_RE.test(blob)) return "refactor";
  if (FEAT_WORD_RE.test(blob)) return "feat";
  return undefined;
}

export function inferScope(files: DiffFile[]): string | undefined {
  if (files.length === 0) return undefined;
  const candidates = files
    .map((file) => scopeFromPath(file.path))
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return undefined;
  const [name, count] = top;
  if (count / files.length < 0.5 && files.length > 2) return undefined;
  if (SKIP_SCOPE_DIRS.has(name)) return undefined;
  return name.slice(0, 32);
}

export function inferSubject(
  diff: GitDiff,
  type: CommitType,
  scope: string | undefined,
  locale: Locale,
): string {
  const files = diff.files;
  if (files.length === 0) {
    return locale === "zh" ? "更新项目文件" : "update project files";
  }

  const added = files.filter((file) => file.status === "A");
  const deleted = files.filter((file) => file.status === "D");
  const renamed = files.filter((file) => file.status === "R");
  const idents =
    files.length <= 3 ? collectAddedIdentifiers(diff.hunks).slice(0, 2) : [];

  if (
    added.length >= 4 &&
    added.length >= files.length - 1 &&
    !scope &&
    type === "feat"
  ) {
    const text = locale === "zh" ? "添加初始实现" : "add initial implementation";
    return normalizeSubject(text);
  }

  if (renamed.length === 1 && files.length === 1) {
    const file = renamed[0]!;
    const text = locale === "zh"
      ? `重命名 ${stem(file.fromPath ?? file.path)} 为 ${stem(file.path)}`
      : `rename ${stem(file.fromPath ?? file.path)} to ${stem(file.path)}`;
    return normalizeSubject(text);
  }
  if (deleted.length === files.length) {
    const verb = locale === "zh" ? "移除" : "remove";
    return normalizeSubject(
      `${verb} ${joinNames(deleted.map((file) => stem(file.path)))}`,
    );
  }
  if (idents.length > 0 && (type === "feat" || type === "fix")) {
    const verb = locale === "zh" 
      ? (type === "fix" ? "修复" : "添加")
      : (type === "fix" ? "fix" : "add");
    return normalizeSubject(`${verb} ${joinNames(idents.map(humanizeIdent))}`);
  }
  if (added.length === 1 && files.length === 1) {
    const verb = locale === "zh" ? "添加" : "add";
    return normalizeSubject(`${verb} ${stem(added[0]!.path)}`);
  }
  if (added.length > 1 && added.length === files.length) {
    const verb = locale === "zh" ? "添加" : "add";
    return normalizeSubject(`${verb} ${summarizeFiles(added, scope)}`);
  }

  const focus =
    files.length === 1 ? stem(files[0]!.path) : summarizeFiles(files, scope);
  return normalizeSubject(verbFor(type, focus, files, locale));
}

function verbFor(
  type: CommitType,
  focus: string,
  files: DiffFile[],
  locale: Locale,
): string {
  const mostlyAdd =
    files.reduce((sum, file) => sum + file.additions, 0) >
    files.reduce((sum, file) => sum + file.deletions, 0) * 1.4;
  
  if (locale === "zh") {
    switch (type) {
      case "feat":
        return mostlyAdd ? `添加 ${focus}` : `更新 ${focus}`;
      case "fix":
        return `修复 ${focus}`;
      case "docs":
        return files.some((file) => /readme/i.test(file.path))
          ? "更新说明文档"
          : `更新 ${focus}`;
      case "test":
        return mostlyAdd ? `添加 ${focus} 测试` : `更新 ${focus} 测试`;
      case "refactor":
        return `重构 ${focus}`;
      case "perf":
        return `改进 ${focus} 性能`;
      case "style":
        return `格式化 ${focus}`;
      case "ci":
        return `更新 ${focus} 工作流`;
      case "build":
        return `更新 ${focus} 构建`;
      case "chore":
        if (
          files.some((file) =>
            /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(file.path),
          )
        ) {
          return "更新依赖";
        }
        return `更新 ${focus}`;
    }
  }
  
  switch (type) {
    case "feat":
      return mostlyAdd ? `add ${focus}` : `update ${focus}`;
    case "fix":
      return `fix ${focus}`;
    case "docs":
      return files.some((file) => /readme/i.test(file.path))
        ? "update readme"
        : `update ${focus}`;
    case "test":
      return mostlyAdd ? `add ${focus} tests` : `update ${focus} tests`;
    case "refactor":
      return `refactor ${focus}`;
    case "perf":
      return `improve ${focus} performance`;
    case "style":
      return `format ${focus}`;
    case "ci":
      return `update ${focus} workflow`;
    case "build":
      return `update ${focus} build`;
    case "chore":
      if (
        files.some((file) =>
          /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(file.path),
        )
      ) {
        return "update dependencies";
      }
      return `update ${focus}`;
  }
}

function inferBreaking(diff: GitDiff): boolean {
  return diff.hunks.some((hunk) =>
    hunk.lines.some((line) => /^\+\s*BREAKING CHANGE:/i.test(line)),
  );
}

export function collectAddedIdentifiers(hunks: DiffHunk[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      const match = line.match(IDENT_RE);
      if (!match?.[1]) continue;
      const name = match[1];
      if (seen.has(name) || name.length < 2) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function inferSummary(
  diff: GitDiff,
  type: CommitType,
  subject: string,
  scope: string | undefined,
  locale: Locale,
): string {
  const totals = fileTotals(diff.files);
  const filesWord = locale === "zh"
    ? (diff.files.length === 1 ? "1 个文件" : `${diff.files.length} 个文件`)
    : (diff.files.length === 1 ? "1 file" : `${diff.files.length} files`);
  const stats = `+${totals.add} / −${totals.del}`;
  const focus = stripLeadingVerb(subject, locale);
  const where = scope 
    ? (locale === "zh" ? ` 在 ${scope} 中` : ` in ${scope}`)
    : "";

  if (locale === "zh") {
    switch (type) {
      case "feat":
        return `添加${focus}${where}。本次 diff 包含 ${filesWord}（${stats}）。`;
      case "fix":
        return `修复${focus}${where}。${filesWord}变更（${stats}）。`;
      case "docs":
        return `更新文档${where}：${focus}。${filesWord}（${stats}）。`;
      case "test":
        return `覆盖${focus}${where}。本次 diff 包含 ${filesWord}（${stats}）。`;
      case "refactor":
        return `重构${focus}${where}，不改变行为。${filesWord}（${stats}）。`;
      case "perf":
        return `加速${focus}${where}。${filesWord}（${stats}）。`;
      case "ci":
        return `保持 CI 诚实${where}：${focus}。${filesWord}（${stats}）。`;
      case "build":
        return `更新构建${where}：${focus}。${filesWord}（${stats}）。`;
      case "style":
        return `格式化${focus}${where}。${filesWord}（${stats}）。`;
      case "chore":
        return `维护工作${where}：${focus}。${filesWord}（${stats}）。`;
    }
  }

  switch (type) {
    case "feat":
      return `Add ${focus}${where}. ${filesWord} in this diff (${stats}).`;
    case "fix":
      return `Fix ${focus}${where}. ${filesWord} changed (${stats}).`;
    case "docs":
      return `Update docs${where}: ${focus}. ${filesWord} (${stats}).`;
    case "test":
      return `Cover ${focus}${where}. ${filesWord} in this diff (${stats}).`;
    case "refactor":
      return `Refactor ${focus}${where} without changing behavior. ${filesWord} (${stats}).`;
    case "perf":
      return `Speed up ${focus}${where}. ${filesWord} (${stats}).`;
    case "ci":
      return `Keep CI honest${where}: ${focus}. ${filesWord} (${stats}).`;
    case "build":
      return `Update the build${where}: ${focus}. ${filesWord} (${stats}).`;
    case "style":
      return `Format ${focus}${where}. ${filesWord} (${stats}).`;
    case "chore":
      return `Housekeeping${where}: ${focus}. ${filesWord} (${stats}).`;
  }
}

function inferChanges(files: DiffFile[], vibe: Vibe, locale: Locale): string[] {
  const limit = vibe === "dry" ? 8 : 12;
  const listed = files.slice(0, limit);
  const items =
    vibe === "dry"
      ? listed.map((file) => `\`${file.path}\``)
      : listed.map((file) => changeLine(file, locale));
  if (files.length > limit) {
    const moreText = locale === "zh" 
      ? `以及其他 ${files.length - limit} 个文件`
      : `And ${files.length - limit} more files`;
    items.push(moreText);
  }
  return items;
}

function changeLine(file: DiffFile, locale: Locale): string {
  const stats = `+${file.additions} −${file.deletions}`;
  if (locale === "zh") {
    switch (file.status) {
      case "A":
        return `添加 \`${file.path}\` (${stats})`;
      case "D":
        return `移除 \`${file.path}\``;
      case "R":
        return `重命名 \`${file.fromPath ?? "?"}\` → \`${file.path}\``;
      case "C":
        return `复制 \`${file.fromPath ?? "?"}\` → \`${file.path}\``;
      default:
        return `更新 \`${file.path}\` (${stats})`;
    }
  }
  switch (file.status) {
    case "A":
      return `Add \`${file.path}\` (${stats})`;
    case "D":
      return `Remove \`${file.path}\``;
    case "R":
      return `Rename \`${file.fromPath ?? "?"}\` → \`${file.path}\``;
    case "C":
      return `Copy \`${file.fromPath ?? "?"}\` → \`${file.path}\``;
    default:
      return `Update \`${file.path}\` (${stats})`;
  }
}

function inferTestPlan(diff: GitDiff, type: CommitType, locale: Locale): string[] {
  const paths = diff.files.map((file) => file.path);
  const plan: string[] = [];
  const hasTests = paths.some((path) => isTestPath(path));
  const hasCli = paths.some((path) => /(^|\/)cli(\.|$)/i.test(path));
  const hasCi = paths.some((path) => isCiPath(path));
  const hasDocs = paths.some((path) => isDocsPath(path));
  const hasCode = paths.some(
    (path) =>
      !isDocsPath(path) &&
      !isCiPath(path) &&
      !isChorePath(path) &&
      !isTestPath(path),
  );

  if (locale === "zh") {
    if (type === "fix") {
      plan.push("复现失败，应用变更，确认问题消失。");
    }
    if (hasTests) {
      plan.push("运行 `npm test`（以及本次 diff 中的新增或更新用例）。");
    } else if (hasCode) {
      plan.push("走一遍快乐路径 — 有单元测试就跑测试，否则手动验证一次。");
    }
    if (hasCli) {
      plan.push("运行 `--help` 和一条典型命令；确认输出仍然清晰。");
    }
    if (hasCi) {
      plan.push("确认工作流仍在 push 和 pull_request 时运行。");
    }
    if (hasDocs) {
      plan.push("浏览渲染后的 markdown，检查失效链接和语气。");
    }
    if (plan.length === 0) {
      plan.push("重读 diff，对主路径进行完整性检查。");
    }
  } else {
    if (type === "fix") {
      plan.push("Reproduce the failure, apply the change, confirm it is gone.");
    }
    if (hasTests) {
      plan.push("Run `npm test` (and the new or updated cases in this diff).");
    } else if (hasCode) {
      plan.push("Hit the happy path once — unit tests if you have them, otherwise a manual pass.");
    }
    if (hasCli) {
      plan.push("Run `--help` and one typical command; confirm the output still reads clean.");
    }
    if (hasCi) {
      plan.push("Confirm the workflow still runs on push and pull_request.");
    }
    if (hasDocs) {
      plan.push("Skim the rendered markdown for broken links and tone.");
    }
    if (plan.length === 0) {
      plan.push("Re-read the diff and sanity-check the main path.");
    }
  }
  return [...new Set(plan)].slice(0, 4);
}

function fileTotals(files: DiffFile[]): { add: number; del: number } {
  return files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
}

function stripLeadingVerb(subject: string, locale: Locale): string {
  if (locale === "zh") {
    return subject
      .replace(
        /^(添加|修复|更新|移除|重命名|重构|改进|格式化|覆盖|发布)\s*/,
        "",
      )
      .trim() || subject;
  }
  return subject
    .replace(
      /^(add|fix|update|remove|rename|refactor|improve|format|cover|ship)\s+/i,
      "",
    )
    .trim() || subject;
}

function scopeFromPath(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts[0] === "packages" && parts[1]) return sanitizeIdent(parts[1]);
  const start = SKIP_SCOPE_DIRS.has(parts[0] ?? "") ? 1 : 0;
  const candidate = parts[start];
  if (!candidate) return undefined;
  if (parts.length < start + 2) {
    if (
      parts.length === start + 1 &&
      !candidate.startsWith(".") &&
      !isDocsPath(path) &&
      !isChorePath(path) &&
      !isCiPath(path)
    ) {
      const name = sanitizeIdent(candidate.replace(/\.[^.]+$/, ""));
      if (name && name !== "index") return name;
    }
    return undefined;
  }
  if (SKIP_SCOPE_DIRS.has(candidate) || candidate.startsWith(".")) {
    return undefined;
  }
  return sanitizeIdent(candidate.replace(/\.[^.]+$/, ""));
}

function sanitizeIdent(value: string): string {
  return value
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function stem(path: string): string {
  const parts = path.split("/").filter(Boolean);
  let base = parts.at(-1) ?? path;
  if (/^(index|main|mod|__init__)\.[^.]+$/i.test(base) && parts.length >= 2) {
    base = parts.at(-2) ?? base;
  }
  base = base.replace(/\.(tests?|spec)\.[^.]+$/i, "");
  base = base.replace(/\.[^.]+$/, "");
  return humanizeIdent(base);
}

function humanizeIdent(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function joinNames(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return "files";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]}, and more`;
}

function summarizeFiles(files: DiffFile[], scope?: string): string {
  if (scope) return scope;
  return joinNames(files.map((file) => stem(file.path)).slice(0, 2));
}

function keywordCorpus(diff: GitDiff): string {
  const paths = diff.files.map((file) => file.path).join("\n");
  const onlyDocs = diff.files.every((file) => isDocsPath(file.path));
  const docPaths = new Set(
    diff.files.filter((file) => isDocsPath(file.path)).map((file) => file.path),
  );
  const lines: string[] = [];
  for (const hunk of diff.hunks) {
    const fromDocs = onlyDocs && docPaths.has(hunk.path);
    for (const line of hunk.lines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (fromDocs || /^\+\s*(?:\/\/|#|\/\*|\*|<!--)/.test(line)) {
        lines.push(line);
      }
    }
  }
  return `${paths}\n${lines.join("\n")}`;
}
