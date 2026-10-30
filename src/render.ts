import pc from "picocolors";
import { formatPr, suggestGhPrCreate } from "./format.ts";
import type { InspectedDiff, ProposedPr } from "./types.ts";

export function renderProposal(
  inspected: InspectedDiff,
  proposal: ProposedPr,
): string {
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
    return `    ${pc.dim(file.status)}  ${file.path}  ${pc.dim(stats)}`;
  });
  if (diff.files.length > 10) {
    fileLines.push(pc.dim(`    … ${diff.files.length - 10} more`));
  }

  const formatted = formatPr(proposal);
  const lines = [
    "",
    `  ${pc.bold("diff-vibe")}  ${pc.dim("·")}  ${pc.cyan(engine)}  ${pc.dim("·")}  ${proposal.type}`,
    "",
    `  ${pc.bold(String(diff.files.length))} ${fileLabel}  ${pc.dim("·")}  ${pc.green(`+${totals.add}`)}  ${pc.red(`−${totals.del}`)}  ${pc.dim("·")}  vs ${inspected.rangeLabel}`,
    "",
    ...fileLines,
    "",
    `  ${pc.dim("proposed")}`,
    "",
    ...indent(formatted),
    "",
    `  ${pc.dim("next")}  diff-vibe --copy    ${pc.dim("or")}  diff-vibe --create`,
    "",
  ];
  return lines.join("\n");
}

function indent(formatted: string): string[] {
  return formatted.split("\n").map((line, index) => {
    if (!line) return "";
    if (index === 0) return `    ${pc.bold(line)}`;
    if (line.startsWith("## ")) return `    ${pc.bold(line)}`;
    return `    ${pc.dim(line)}`;
  });
}

export function renderGhHint(proposal: ProposedPr): string {
  return `\n  ${pc.dim("suggested")}\n\n    ${suggestGhPrCreate(proposal.title, proposal.body)}\n`;
}

export function renderError(message: string): string {
  return `${pc.red("diff-vibe")}  ${message}`;
}

export function renderVersion(version: string): string {
  return `diff-vibe ${version}`;
}

export function renderCopied(ok: boolean): string {
  return ok
    ? `  ${pc.green("copied")}  clipboard\n`
    : `  ${pc.yellow("clipboard unavailable")}  printed instead\n`;
}

export function textOutput(
  proposal: ProposedPr,
  mode: "full" | "title" | "body",
): string {
  if (mode === "title") return `${proposal.title}\n`;
  if (mode === "body") return `${proposal.body}\n`;
  return `${formatPr(proposal)}\n`;
}
