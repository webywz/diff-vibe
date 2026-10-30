import pc, { createColors } from "picocolors";
import { formatPr, suggestGhPrCreate } from "./format.ts";
import type { InspectedDiff, ProposedPr } from "./types.ts";

export interface RenderOptions {
  noColor?: boolean;
}

export function renderProposal(
  inspected: InspectedDiff,
  proposal: ProposedPr,
  opts: RenderOptions = {},
): string {
  const colors = createColors(!(opts.noColor ?? false));
  const { diff } = inspected;
  const totals = diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
  const fileLabel = diff.files.length === 1 ? "file" : "files";
  const engine = proposal.engine === "ai" ? "ai" : "heuristic";
  const fileLines = diff.files.slice(0, 10).map((file) => {
    const stats = `+${file.additions} −${file.deletions}`;
    return `    ${colors.dim(file.status)}  ${file.path}  ${colors.dim(stats)}`;
  });
  if (diff.files.length > 10) {
    fileLines.push(colors.dim(`    … ${diff.files.length - 10} more`));
  }

  const formatted = formatPr(proposal);
  const lines = [
    "",
    `  ${colors.bold("diff-vibe")}  ${colors.dim("·")}  ${colors.cyan(engine)}  ${colors.dim("·")}  ${proposal.type}`,
    "",
    `  ${colors.bold(String(diff.files.length))} ${fileLabel}  ${colors.dim("·")}  ${colors.green(`+${totals.add}`)}  ${colors.red(`−${totals.del}`)}  ${colors.dim("·")}  vs ${inspected.rangeLabel}`,
    "",
    ...fileLines,
    "",
    `  ${colors.dim("proposed")}`,
    "",
    ...indent(formatted, colors),
    "",
    `  ${colors.dim("next")}  diff-vibe --copy    ${colors.dim("or")}  diff-vibe --create`,
    "",
  ];
  return lines.join("\n");
}

function indent(formatted: string, colors: ReturnType<typeof createColors>): string[] {
  return formatted.split("\n").map((line, index) => {
    if (!line) return "";
    if (index === 0) return `    ${colors.bold(line)}`;
    if (line.startsWith("## ")) return `    ${colors.bold(line)}`;
    return `    ${colors.dim(line)}`;
  });
}

export function renderGhHint(proposal: ProposedPr, opts: RenderOptions = {}): string {
  const colors = createColors(!(opts.noColor ?? false));
  return `\n  ${colors.dim("suggested")}\n\n    ${suggestGhPrCreate(proposal.title, proposal.body)}\n`;
}

export function renderError(message: string, opts: RenderOptions = {}): string {
  const colors = createColors(!(opts.noColor ?? false));
  return `${colors.red("diff-vibe")}  ${message}`;
}

export function renderVersion(version: string, opts: RenderOptions = {}): string {
  return `diff-vibe ${version}`;
}

export function renderCopied(ok: boolean, opts: RenderOptions = {}): string {
  const colors = createColors(!(opts.noColor ?? false));
  return ok
    ? `  ${colors.green("copied")}  clipboard\n`
    : `  ${colors.yellow("clipboard unavailable")}  printed instead\n`;
}

export function textOutput(
  proposal: ProposedPr,
  mode: "full" | "title" | "body",
): string {
  if (mode === "title") return `${proposal.title}\n`;
  if (mode === "body") return `${proposal.body}\n`;
  return `${formatPr(proposal)}\n`;
}
