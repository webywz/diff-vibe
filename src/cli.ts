#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToClipboard } from "./clipboard.ts";
import { GitError, inspectDiff } from "./git.ts";
import {
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  formatGitHubAnnotations,
} from "./github.ts";
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
import { runSuite } from "./suite.ts";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${renderError(error.message, { noColor: options?.noColor })}\n\n${helpText()}`);
      return 1;
    }
    throw error;
  }

  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${renderVersion(readVersion(), { noColor: options.noColor })}\n`);
    return 0;
  }

  if (options.suite) {
    return runSuiteMode(options);
  }

  const piped = !process.stdout.isTTY;
  try {
    const inspected = inspectDiff(process.cwd(), options.base);
    const proposal = await proposePr(inspected.diff, {
      vibe: options.vibe,
      locale: options.locale,
      preferAi: !options.noAi,
    });
    const mode = options.titleOnly
      ? "title"
      : options.bodyOnly
        ? "body"
        : "full";

    if (options.github) {
      const ann = formatGitHubAnnotations(proposal, inspected, {
        maxAnnotations: options.maxAnnotations,
      });
      // Keep --json stdout machine-parseable; annotations ride on stderr.
      if (options.json) process.stderr.write(ann);
      else process.stdout.write(ann);
      try {
        appendGitHubJobOutput(proposal, inspected);
      } catch (err) {
        process.stderr.write(
          `diff-vibe: GITHUB_OUTPUT skipped (${err instanceof Error ? err.message : err})\n`,
        );
      }
      try {
        appendGitHubStepSummary(proposal, inspected);
      } catch (err) {
        process.stderr.write(
          `diff-vibe: GITHUB_STEP_SUMMARY skipped (${err instanceof Error ? err.message : err})\n`,
        );
      }
    }

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
            locale: proposal.locale,
            base: inspected.rangeLabel,
          },
          null,
          2,
        )}\n`
      : piped || options.titleOnly || options.bodyOnly
        ? textOutput(proposal, mode)
        : renderProposal(inspected, proposal, { noColor: options.noColor });

    if (options.out) {
      // Write to file
      try {
        writeFileSync(options.out, printable, "utf8");
        if (!options.quiet) {
          process.stderr.write(`wrote report to ${options.out}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `${renderError(`Failed to write ${options.out}: ${err instanceof Error ? err.message : err}`, { noColor: options.noColor })}\n`,
        );
        return 1;
      }
      // With --json, also write to stdout
      if (options.json) {
        process.stdout.write(printable);
      }
      // Otherwise stdout stays empty (file only)
    } else {
      // Original behavior when --out is not set
      if (options.json) {
        process.stdout.write(printable);
      } else if (!options.quiet) {
        if (options.github) {
          process.stdout.write("::group::diff-vibe report\n");
        }
        process.stdout.write(printable);
        if (options.github) {
          process.stdout.write("::endgroup::\n");
        }
      }
    }

    if (options.copy) {
      const copied = copyToClipboard(
        options.json
          ? printable
          : mode === "full"
            ? `${formatPr(proposal)}\n`
            : textOutput(proposal, mode),
      );
      if (!piped && !options.json && !options.quiet) {
        process.stdout.write(renderCopied(copied, { noColor: options.noColor }));
      } else if (!copied) {
        process.stderr.write(`${renderError("clipboard unavailable", { noColor: options.noColor })}\n`);
      }
    }

    if (options.open && !options.create && !options.update) {
      if (piped || options.json || options.titleOnly || options.bodyOnly || options.quiet) {
        process.stderr.write(`${suggestGhPrCreate(proposal.title, proposal.body)}\n`);
      } else {
        process.stdout.write(renderGhHint(proposal, { noColor: options.noColor }));
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
        if (piped || options.json || options.titleOnly || options.bodyOnly || options.quiet) {
          process.stderr.write(`${line}\n`);
        } else {
          process.stdout.write(`\n  ${line}\n`);
        }
      } else {
        process.stderr.write(`${renderError(created.message, { noColor: options.noColor })}\n`);
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
        if (piped || options.json || options.titleOnly || options.bodyOnly || options.quiet) {
          process.stderr.write(`${line}\n`);
        } else {
          process.stdout.write(`\n  ${line}\n`);
        }
      } else {
        process.stderr.write(`${renderError(updated.message, { noColor: options.noColor })}\n`);
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
    process.stderr.write(`${renderError(text, { noColor: options.noColor })}\n`);
    return 1;
  }
}

async function runSuiteMode(options: import("./types.ts").CliOptions): Promise<number> {
  try {
    const result = await runSuite({
      pattern: options.suite!,
      vibe: options.vibe,
      locale: options.locale,
      preferAi: !options.noAi,
    });

    const output = JSON.stringify(result, null, 2);

    if (options.out) {
      // Write to file
      try {
        writeFileSync(options.out, `${output}\n`, "utf8");
        if (!options.quiet) {
          process.stderr.write(`wrote report to ${options.out}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `${renderError(`Failed to write ${options.out}: ${err instanceof Error ? err.message : err}`)}\n`,
        );
        return 1;
      }
      // With --json, also write to stdout
      if (options.json) {
        process.stdout.write(`${output}\n`);
      }
      // Otherwise stdout stays quiet (file only)
    } else {
      // Original behavior when --out is not set
      process.stdout.write(`${output}\n`);
    }

    const threshold = options.failAbove ?? 0;
    if (result.stats.failed > threshold) {
      process.stderr.write(
        `${renderError(`Suite failed: ${result.stats.failed} failures (threshold: ${threshold})`, { noColor: options.noColor })}\n`,
      );
      return 1;
    }

    return 0;
  } catch (error) {
    const text = error instanceof Error ? error.message : "Unexpected error";
    process.stderr.write(`${renderError(text, { noColor: options.noColor })}\n`);
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
        `${renderError(error instanceof Error ? error.message : "Unexpected error", { noColor: false })}\n`,
      );
      process.exit(1);
    },
  );
}
