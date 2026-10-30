import {
  COMMIT_TYPES,
  type CommitType,
  type Engine,
  type ProposedPr,
} from "./types.ts";

const TYPE_PATTERN = COMMIT_TYPES.join("|");
const HEADER_RE = new RegExp(
  `^(${TYPE_PATTERN})(?:\\(([a-zA-Z0-9][\\w./-]{0,62})\\))?(!)?:\\s*(.+)$`,
);

export function formatTitle(input: {
  type: CommitType;
  scope?: string;
  subject: string;
  breaking: boolean;
}): string {
  const bang = input.breaking ? "!" : "";
  const subject = normalizeSubject(input.subject);
  return input.scope
    ? `${input.type}(${input.scope})${bang}: ${subject}`
    : `${input.type}${bang}: ${subject}`;
}

export function formatBody(input: {
  summary: string;
  changes: string[];
  testPlan: string[];
}): string {
  const changes =
    input.changes.length > 0 ? input.changes : ["See the diff for details."];
  const testPlan =
    input.testPlan.length > 0
      ? input.testPlan
      : ["Re-read the diff and sanity-check the main path."];
  return [
    "## Summary",
    "",
    input.summary.trim() || "Update project files.",
    "",
    "## Changes",
    "",
    ...changes.map((item) => `- ${item.replace(/^[-*]\s+/, "")}`),
    "",
    "## Test plan",
    "",
    ...testPlan.map((item) => `- ${item.replace(/^[-*]\s+/, "")}`),
  ].join("\n");
}

export function formatPr(proposal: ProposedPr): string {
  return `${proposal.title}\n\n${proposal.body}`;
}

export function normalizeSubject(subject: string): string {
  let text = subject.replace(/\s+/g, " ").trim();
  text = text.replace(/^[`'"]+|[`'"]+$/g, "");
  text = text.replace(/\.+$/, "");
  if (!text) return "update project files";
  if (/^[A-Z][a-z]/.test(text) && !/^[A-Z]{2,}/.test(text)) {
    text = text.charAt(0).toLowerCase() + text.slice(1);
  }
  return clip(text, 72);
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max - 1);
  const atWord = sliced.lastIndexOf(" ");
  const base = atWord >= 40 ? sliced.slice(0, atWord) : sliced;
  return `${base.replace(/[ ,;:.-]+$/, "")}…`;
}

export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:\w+)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .replace(/^\s*(?:pr|pull request|title)\s*:\s*/i, "")
    .trim();
}

export function parseTitle(
  text: string,
): {
  type: CommitType;
  scope?: string;
  subject: string;
  breaking: boolean;
} | null {
  const cleaned = stripFences(text).trim();
  const line =
    cleaned.split(/\r?\n/).find((entry) => HEADER_RE.test(entry.trim())) ?? "";
  const match = line.trim().match(HEADER_RE);
  if (!match) return null;
  return {
    type: match[1] as CommitType,
    scope: match[2],
    breaking: Boolean(match[3]),
    subject: normalizeSubject(match[4] ?? ""),
  };
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function suggestGhPrCreate(title: string, body: string): string {
  return `gh pr create --title ${shQuote(title)} --body ${shQuote(body)}`;
}

export function suggestGhPrEdit(title: string, body: string): string {
  return `gh pr edit --title ${shQuote(title)} --body ${shQuote(body)}`;
}

export function parseAiDraft(
  text: string,
  engine: Engine = "ai",
): Partial<ProposedPr> | null {
  const cleaned = stripFences(text).trim();
  if (!cleaned) return null;

  const json = extractJson(cleaned);
  if (json) {
    const title =
      typeof json.title === "string" ? json.title.trim() : undefined;
    const summary =
      typeof json.summary === "string" ? json.summary.trim() : undefined;
    const changes = asStringList(json.changes);
    const testPlan = asStringList(json.testPlan ?? json.test_plan);
    const parsedTitle = title ? parseTitle(title) : null;
    if (!title && !summary) return null;
    const type = parsedTitle?.type;
    const subject = parsedTitle?.subject ?? (title ? normalizeSubject(title) : "");
    return {
      title,
      summary,
      changes,
      testPlan,
      type,
      scope: parsedTitle?.scope,
      subject,
      breaking: parsedTitle?.breaking ?? false,
      engine,
    };
  }

  const hasHeadings = /^#{1,3}\s+/m.test(cleaned);
  const titleLine = firstNonEmpty(cleaned);
  const parsedTitle = parseTitle(titleLine);
  if (!parsedTitle && !hasHeadings) return null;
  const sections = hasHeadings ? parseMarkdownSections(cleaned) : {};
  if (!parsedTitle && !sections.summary) return null;
  return {
    title: parsedTitle ? formatTitle(parsedTitle) : titleLine,
    summary: sections.summary,
    changes: sections.changes,
    testPlan: sections.testPlan,
    type: parsedTitle?.type,
    scope: parsedTitle?.scope,
    subject: parsedTitle?.subject,
    breaking: parsedTitle?.breaking ?? false,
    engine,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function firstNonEmpty(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? ""
  );
}

function parseMarkdownSections(text: string): {
  summary?: string;
  changes?: string[];
  testPlan?: string[];
} {
  const blocks = splitSections(text);
  return {
    summary: blocks.get("summary"),
    changes: bulletList(blocks.get("changes")),
    testPlan: bulletList(blocks.get("test plan") ?? blocks.get("testplan")),
  };
}

function splitSections(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let current = "summary";
  const buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) map.set(current, body);
    buf.length = 0;
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      flush();
      current = heading[1]!.trim().toLowerCase();
      continue;
    }
    buf.push(line);
  }
  flush();
  return map;
}

function bulletList(text: string | undefined): string[] | undefined {
  if (!text) return undefined;
  const items = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}
