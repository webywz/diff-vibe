import { appendFileSync } from "node:fs";
import type { CommitType, InspectedDiff, ProposedPr } from "./types.ts";

export interface GitHubFormatOptions {
  /** Soft cap for PR annotation noise. Default 20. */
  maxAnnotations?: number;
}

type AnnotationType = "error" | "warning" | "notice";

/** Escape payload text for workflow command messages. */
export function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape workflow command property values (file, title, …). */
export function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function annotation(
  type: AnnotationType,
  message: string,
  props: { file?: string; line?: number; title?: string } = {},
): string {
  const parts: string[] = [];
  if (props.file) parts.push(`file=${escapeProperty(props.file)}`);
  if (props.line !== undefined && Number.isFinite(props.line)) {
    parts.push(`line=${Math.max(1, Math.trunc(props.line))}`);
  }
  if (props.title) parts.push(`title=${escapeProperty(props.title)}`);
  const meta = parts.length > 0 ? ` ${parts.join(",")}` : "";
  return `::${type}${meta}::${escapeData(message)}`;
}

/** Heuristic risk tier → annotation level (breaking / fix weigh heavier). */
export function proposalAnnotationType(
  proposal: ProposedPr,
): AnnotationType {
  if (proposal.breaking) return "error";
  switch (proposal.type as CommitType) {
    case "fix":
      return "warning";
    case "feat":
    case "perf":
    case "refactor":
      return "notice";
    default:
      return "notice";
  }
}

function oneLine(value: string, max = 200): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

/**
 * Emit GitHub Actions workflow commands so PR Checks show the proposed PR draft.
 * Offline / local-safe: pure string formatting, no network.
 */
export function formatGitHubAnnotations(
  proposal: ProposedPr,
  inspected: InspectedDiff,
  options: GitHubFormatOptions = {},
): string {
  const max = options.maxAnnotations ?? 20;
  const lines: string[] = [];
  const push = (line: string): void => {
    if (lines.length < max) lines.push(line);
  };

  const primary = inspected.diff.files[0]?.path;

  push(
    annotation(proposalAnnotationType(proposal), proposal.title, {
      file: primary,
      title: "diff-vibe · title",
    }),
  );

  if (proposal.breaking) {
    push(
      annotation("error", "Breaking change detected in this diff.", {
        file: primary,
        title: "diff-vibe · breaking",
      }),
    );
  }

  if (proposal.summary.trim()) {
    push(
      annotation("notice", oneLine(proposal.summary), {
        file: primary,
        title: "diff-vibe · summary",
      }),
    );
  }

  for (const change of proposal.changes) {
    const fileMatch = change.match(/`([^`]+)`/);
    push(
      annotation("notice", oneLine(change), {
        file: fileMatch?.[1] ?? primary,
        title: "diff-vibe · change",
      }),
    );
  }

  for (const step of proposal.testPlan.slice(0, 3)) {
    push(
      annotation("notice", oneLine(step), {
        title: "diff-vibe · test-plan",
      }),
    );
  }

  push(
    annotation(
      "notice",
      `${inspected.diff.files.length} files · engine ${proposal.engine} · vs ${inspected.rangeLabel}`,
      { title: "diff-vibe · meta" },
    ),
  );

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Append job outputs when running inside Actions (`GITHUB_OUTPUT`). */
export function appendGitHubJobOutput(
  proposal: ProposedPr,
  inspected: InspectedDiff,
): void {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const body = [
    `title=${oneLine(proposal.title, 256)}`,
    `summary=${oneLine(proposal.summary, 400)}`,
    `type=${proposal.type}`,
    `breaking=${proposal.breaking}`,
    `engine=${proposal.engine}`,
    `base=${oneLine(inspected.rangeLabel, 120)}`,
    `findings=${proposal.changes.length}`,
  ].join("\n");
  appendFileSync(path, `${body}\n`, "utf8");
}

/** Build a short Markdown Job Summary for Actions (no env I/O). */
export function formatGitHubStepSummary(
  proposal: ProposedPr,
  inspected: InspectedDiff,
): string {
  const totals = inspected.diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
  const lines: string[] = [
    "## diff-vibe",
    "",
    `| | |`,
    `| --- | --- |`,
    `| **Title** | ${proposal.title} |`,
    `| **Type** | \`${proposal.type}\`${proposal.scope ? ` (\`${proposal.scope}\`)` : ""} |`,
    `| **Breaking** | ${proposal.breaking} |`,
    `| **Engine** | ${proposal.engine} |`,
    `| **Files** | ${inspected.diff.files.length} (+${totals.add} / −${totals.del}) · vs ${inspected.rangeLabel} |`,
    "",
  ];

  if (proposal.summary.trim()) {
    lines.push(`_${oneLine(proposal.summary, 280)}_`, "");
  }

  const findings: string[] = [];
  for (const change of proposal.changes.slice(0, 6)) {
    findings.push(`- ${oneLine(change, 160)}`);
  }
  if (findings.length > 0) {
    lines.push("### Key changes", "", ...findings, "");
  } else {
    lines.push("_No change bullets — empty or meta-only diff._", "");
  }
  return lines.join("\n");
}

/**
 * Append a concise Job Summary when running inside Actions (`GITHUB_STEP_SUMMARY`).
 * No-op when the env var is unset.
 */
export function appendGitHubStepSummary(
  proposal: ProposedPr,
  inspected: InspectedDiff,
): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${formatGitHubStepSummary(proposal, inspected)}\n`, "utf8");
}
