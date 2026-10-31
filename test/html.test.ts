import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { escapeHtml, formatHtml, THEME_TOKENS } from "../src/html.ts";
import {
  DEFAULT_HTML_THEME,
  HTML_THEMES,
  type HtmlTheme,
  type InspectedDiff,
  type ProposedPr,
} from "../src/types.ts";
import { diffFile, gitDiff } from "./helpers.ts";

const HOSTILE = `As an AI model, <img src=x onerror="alert(1)"> & </script> studies show.`;

function sampleProposal(partial: Partial<ProposedPr> = {}): ProposedPr {
  return {
    title: "feat(auth): add logout",
    body: `## Summary\n\n${HOSTILE}\n\n## Changes\n\n- Add \`src/auth.ts\`\n\n## Test plan\n\n- Hit the happy path.`,
    type: "feat",
    scope: "auth",
    subject: "add logout",
    summary: HOSTILE,
    changes: ["Add `src/auth.ts` (+8 −0)"],
    testPlan: ["Hit the happy path once."],
    breaking: false,
    engine: "heuristic",
    locale: "en",
    ...partial,
  };
}

function sampleInspected(partial: Partial<InspectedDiff> = {}): InspectedDiff {
  return {
    diff: gitDiff([
      diffFile({ path: "src/auth.ts", status: "M", additions: 8, deletions: 0 }),
    ]),
    rangeLabel: "HEAD",
    ...partial,
  };
}

describe("escapeHtml / formatHtml", () => {
  it("escapes angle brackets amp quotes", () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script>&'`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;",
    );
  });

  it("emits a self-contained proposal report with expected markers", () => {
    const inspected = sampleInspected();
    const proposal = sampleProposal({ breaking: true });
    const html = formatHtml(inspected, proposal, { vibe: "punchy" });
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /diff-vibe/);
    assert.match(html, /feat\(auth\): add logout/);
    assert.match(html, /punchy/);
    assert.match(html, /heuristic/);
    assert.match(html, /src\/auth\.ts/);
    assert.match(html, /\+8/);
    assert.match(html, /HEAD/);
    assert.match(html, /breaking/i);
    assert.match(html, /<style>/);
    assert.doesNotMatch(html, /cdn\.|unpkg|jsdelivr|fonts\.googleapis/i);
    assert.doesNotMatch(html, /<script[\s>]/i);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
    assert.match(html, /onerror=&quot;/);
    assert.doesNotMatch(html, /\sonerror="/i);
  });

  it("default theme matches ember CSS (0.1.17 look)", () => {
    const omitted = formatHtml(sampleInspected(), sampleProposal(), { vibe: "calm" });
    const ember = formatHtml(sampleInspected(), sampleProposal(), {
      vibe: "calm",
      theme: "ember",
    });
    assert.equal(omitted, ember);
    assert.match(omitted, /--bg: #1a1b26;/);
    assert.match(omitted, /border-color: #5a1d1d;/);
    assert.match(omitted, /color: #a9b1d6;/);
    assert.doesNotMatch(omitted, /var\(--hot-border\)/);
    assert.doesNotMatch(omitted, /var\(--text-soft\)/);
  });

  it("each HTML theme has a distinct palette", () => {
    const css: Record<HtmlTheme, string> = {
      ember: formatHtml(sampleInspected(), sampleProposal(), { theme: "ember" }),
      fog: formatHtml(sampleInspected(), sampleProposal(), { theme: "fog" }),
      midnight: formatHtml(sampleInspected(), sampleProposal(), { theme: "midnight" }),
      paper: formatHtml(sampleInspected(), sampleProposal(), { theme: "paper" }),
    };
    const bgs = HTML_THEMES.map((name) => THEME_TOKENS[name]["--bg"]);
    assert.equal(new Set(bgs).size, HTML_THEMES.length);
    assert.equal(DEFAULT_HTML_THEME, "ember");
    for (const name of HTML_THEMES) {
      assert.match(css[name], new RegExp(`--bg: ${THEME_TOKENS[name]["--bg"]};`));
      assert.doesNotMatch(css[name], /cdn\.|unpkg|jsdelivr|fonts\.googleapis/i);
      assert.doesNotMatch(css[name], /<script[\s>]/i);
      assert.doesNotMatch(css[name], /<link\s/i);
    }
    assert.match(css.fog, /var\(--text-soft\)/);
    assert.match(css.midnight, /var\(--hot-border\)/);
    assert.match(css.paper, /var\(--text-soft\)/);
    assert.notEqual(css.ember, css.fog);
    assert.notEqual(css.ember, css.midnight);
    assert.notEqual(css.ember, css.paper);
    assert.notEqual(css.fog, css.midnight);
    assert.notEqual(css.fog, css.paper);
    assert.notEqual(css.midnight, css.paper);
  });

  it("uses zh labels when locale is zh", () => {
    const html = formatHtml(
      sampleInspected(),
      sampleProposal({ locale: "zh" }),
      { vibe: "calm" },
    );
    assert.match(html, /lang="zh"/);
    assert.match(html, /提案/);
    assert.match(html, /摘要/);
  });
});

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.ts");
const tsxBin = join(root, "node_modules", ".bin", "tsx");

function run(
  cwd: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      DIFF_VIBE_VIBE: "calm",
      NO_COLOR: "1",
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "diff-vibe-html-"));
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "vibe@test.local"]);
  git(cwd, ["config", "user.name", "Vibe Tester"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(
    join(cwd, "src", "auth.ts"),
    "export function login() {\n  return true;\n}\n",
  );
  git(cwd, ["add", "src/auth.ts"]);
  git(cwd, ["commit", "-m", "chore: seed"]);
  writeFileSync(
    join(cwd, "src", "auth.ts"),
    "export function login() {\n  return true;\n}\nexport function logout() {\n  return false;\n}\n",
  );
  return cwd;
}

const repos: string[] = [];

after(() => {
  for (const cwd of repos) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe("--html CLI", () => {
  it("lists --html in help", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--html \[path\]/);
    assert.match(help.stdout, /Self-contained HTML report/);
    assert.match(help.stdout, /--html and --json cannot share stdout/);
    assert.match(help.stdout, /--theme /);
    assert.match(help.stdout, /ember \(default\)/);
    assert.match(help.stdout, /fog/);
    assert.match(help.stdout, /midnight/);
    assert.match(help.stdout, /paper/);
  });

  it("defaults to ember CSS and accepts --theme ember", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const omitted = run(cwd, ["--no-ai", "--html"]);
    const ember = run(cwd, ["--no-ai", "--html", "--theme", "ember"]);
    assert.equal(omitted.status, 0, omitted.stderr);
    assert.equal(ember.status, 0, ember.stderr);
    assert.equal(omitted.stdout, ember.stdout);
    assert.match(omitted.stdout, /--bg: #1a1b26;/);
  });

  it("applies each --theme palette on stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const seen = new Set<string>();
    for (const name of HTML_THEMES) {
      const result = run(cwd, ["--no-ai", "--html", "--theme", name]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<!DOCTYPE html>/i);
      assert.match(
        result.stdout,
        new RegExp(`--bg: ${THEME_TOKENS[name]["--bg"]};`),
      );
      assert.doesNotMatch(result.stdout, /cdn\.|unpkg|jsdelivr|fonts\.googleapis/i);
      seen.add(THEME_TOKENS[name]["--bg"]!);
    }
    assert.equal(seen.size, HTML_THEMES.length);
  });

  it("rejects an invalid --theme with UsageError", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html", "--theme", "solar"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid --theme/);
    assert.match(result.stderr, /ember, fog, midnight, paper/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps --theme with --github, --quiet, and --locale", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--html",
      "--theme",
      "fog",
      "--github",
      "--quiet",
      "--locale",
      "en",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.match(result.stdout, /--bg: #e8eef4;/);
    assert.match(result.stderr, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /next {2}diff-vibe --copy/);
  });

  it("does not restyle pretty or --json when --html is absent", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const pretty = run(cwd, ["--no-ai", "--theme", "paper"]);
    assert.equal(pretty.status, 0, pretty.stderr);
    assert.match(pretty.stdout, /feat\(auth\): /);
    assert.match(pretty.stdout, /## Summary/);
    assert.doesNotMatch(pretty.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(pretty.stdout, /--bg: #f6f0e4;/);

    const json = run(cwd, ["--no-ai", "--json", "--theme", "midnight"]);
    assert.equal(json.status, 0, json.stderr);
    const parsed = JSON.parse(json.stdout) as { engine: string; locale: string };
    assert.equal(parsed.engine, "heuristic");
    assert.equal(parsed.locale, "en");
    assert.doesNotMatch(json.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(json.stdout, /theme/);
  });

  it("prints HTML to stdout when path is omitted", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.match(result.stdout, /diff-vibe/);
    assert.match(result.stdout, /feat\(auth\): /);
    assert.match(result.stdout, /## Summary|Summary/);
    assert.doesNotMatch(result.stdout, /cdn\.|unpkg|jsdelivr|fonts\.googleapis/i);
    assert.doesNotMatch(result.stdout, /next {2}diff-vibe --copy/);
  });

  it("writes HTML to path and does not dump it to stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "nested", "report.html");
    const result = run(cwd, ["--no-ai", "--html", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /wrote html report to/);
    assert.match(result.stderr, /report\.html/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.equal(existsSync(outFile), true);
    const content = readFileSync(outFile, "utf8");
    assert.match(content, /<!DOCTYPE html>/i);
    assert.match(content, /diff-vibe/);
    assert.match(content, /feat\(auth\): /);
  });

  it("rejects --html together with --json", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--html", "--json"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot be combined with --json/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps default pretty stdout when --html is absent", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /feat\(auth\): /);
    assert.match(result.stdout, /## Summary/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("keeps --json stdout unchanged when --html is absent", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      title: string;
      engine: string;
      locale: string;
    };
    assert.equal(parsed.engine, "heuristic");
    assert.equal(parsed.locale, "en");
    assert.match(parsed.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
  });

  it("suppresses pretty report with --html --quiet (HTML still on stdout)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--quiet", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(result.stdout, /next {2}diff-vibe --copy/);
    assert.doesNotMatch(result.stderr, /## Summary/);
  });

  it("keeps --github annotations with --html (annotations on stderr)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--github", "--html"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    assert.doesNotMatch(result.stdout, /::(error|warning|notice) /);
    assert.match(result.stderr, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::group::/);
  });

  it("keeps --github annotations + STEP_SUMMARY with --html path", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const dir = mkdtempSync(join(tmpdir(), "diff-vibe-html-gh-"));
    repos.push(dir);
    const htmlFile = join(dir, "proposal.html");
    const sumFile = join(dir, "step_summary.md");
    const outFile = join(dir, "github_output");
    const result = run(cwd, ["--no-ai", "--github", "--html", htmlFile], {
      GITHUB_STEP_SUMMARY: sumFile,
      GITHUB_OUTPUT: outFile,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.match(readFileSync(htmlFile, "utf8"), /<!DOCTYPE html>/i);
    assert.match(readFileSync(sumFile, "utf8"), /## diff-vibe/);
    assert.match(readFileSync(outFile, "utf8"), /^title=/m);
  });

  it("suppresses pretty group with --html path --github --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const htmlFile = join(cwd, "proposal.html");
    const result = run(cwd, ["--no-ai", "--github", "--quiet", "--html", htmlFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::group::/);
    assert.doesNotMatch(result.stdout, /<!DOCTYPE html>/i);
    assert.equal(result.stderr.includes("wrote html report to"), false);
    assert.match(readFileSync(htmlFile, "utf8"), /diff-vibe/);
  });

  it("writes pretty to --out and HTML to stdout", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.md");
    const result = run(cwd, ["--no-ai", "--html", "--out", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!DOCTYPE html>/i);
    const file = readFileSync(outFile, "utf8");
    assert.match(file, /feat\(auth\): /);
    assert.doesNotMatch(file, /<!DOCTYPE html>/i);
  });
});
