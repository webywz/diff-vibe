#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToClipboard } from "./clipboard.ts";
import { GitError, inspectDiff } from "./git.ts";
import { helpText, parseArgs, UsageError } from "./parse-args.ts";
import { proposePr } from "./propose.ts";
import {
  renderCopied,
  renderError,
  renderGhHint,
  renderProposal,
  renderVersion,
  textOutput,
} from "./render.ts";
import { formatPr, suggestGhPrCreate } from "./format.ts";
import { createPrWithGh, updatePrWithGh } from "./gh.ts";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${renderError(error.message)}\n\n${helpText()}`);
      return 1;
    }
    throw error;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${renderVersion(readVersion())}\n`);
    return 0;
  }

  const piped = !process.stdout.isTTY;
  try {
    const inspected = inspectDiff(process.cwd(), options.base);
    const proposal = await proposePr(inspected.diff, {
      vibe: options.vibe,
      preferAi: !options.noAi,
    });
    const mode = options.titleOnly
      ? "title"
      : options.bodyOnly
        ? "body"
        : "full";
    const printable = options.json
      ? `${JSON.stringify(
          {
            title: proposal.title,
            body: proposal.body,
            type: proposal.type,
            scope: proposal.scope,
            subject: proposal.subject,
            summary: proposal.summary,
            changes: proposal.changes,
            testPlan: proposal.testPlan,
            breaking: proposal.breaking,
            engine: proposal.engine,
            base: inspected.rangeLabel,
          },
          null,
          2,
        )}\n`
      : piped || options.titleOnly || options.bodyOnly
        ? textOutput(proposal, mode)
        : renderProposal(inspected, proposal);

    process.stdout.write(printable);

    if (options.copy) {
      const copied = copyToClipboard(
        options.json
          ? printable
          : mode === "full"
            ? `${formatPr(proposal)}\n`
            : textOutput(proposal, mode),
      );
      if (!piped && !options.json) {
        process.stdout.write(renderCopied(copied));
      } else if (!copied) {
        process.stderr.write(`${renderError("clipboard unavailable")}\n`);
      }
    }

    if (options.open && !options.create && !options.update) {
      if (piped || options.json || options.titleOnly || options.bodyOnly) {
        process.stderr.write(`${suggestGhPrCreate(proposal.title, proposal.body)}\n`);
      } else {
        process.stdout.write(renderGhHint(proposal));
      }
    }

    if (options.create) {
      const created = createPrWithGh({
        title: proposal.title,
        body: proposal.body,
        draft: options.draft,
      });
      if (created.ok) {
        const line = created.url
          ? `created  ${created.url}`
          : `created  ${created.message}`;
        if (piped || options.json || options.titleOnly || options.bodyOnly) {
          process.stderr.write(`${line}\n`);
        } else {
          process.stdout.write(`\n  ${line}\n`);
        }
      } else {
        process.stderr.write(`${renderError(created.message)}\n`);
        process.stderr.write(`${created.suggestedCommand}\n`);
        return 1;
      }
    }

    if (options.update) {
      const updated = updatePrWithGh({
        title: proposal.title,
        body: proposal.body,
      });
      if (updated.ok) {
        const line = updated.url
          ? `updated  ${updated.url}`
          : `updated  ${updated.message}`;
        if (piped || options.json || options.titleOnly || options.bodyOnly) {
          process.stderr.write(`${line}\n`);
        } else {
          process.stdout.write(`\n  ${line}\n`);
        }
      } else {
        process.stderr.write(`${renderError(updated.message)}\n`);
        process.stderr.write(`${updated.suggestedCommand}\n`);
        return 1;
      }
    }

    return 0;
  } catch (error) {
    const text =
      error instanceof GitError || error instanceof Error
        ? error.message
        : "Unexpected error";
    process.stderr.write(`${renderError(text)}\n`);
    return 1;
  }
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    // npm/.bin and npx invoke via symlink; compare real paths (align agent-trace / context-diet).
    return (
      realpathSync(entry) === self ||
      realpathSync(entry) === realpathSync(self)
    );
  } catch {
    return /(cli\.(js|ts)|diff-vibe)$/.test(entry);
  }
}

if (isDirectRun()) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `${renderError(error instanceof Error ? error.message : "Unexpected error")}\n`,
      );
      process.exit(1);
    },
  );
}
