import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
  const cwd = mkdtempSync(join(tmpdir(), "diff-vibe-"));
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

describe("cli e2e", () => {
  it("prints a conventional title and markdown body from staged+unstaged changes", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /feat\(auth\): /);
    assert.match(result.stdout, /## Summary/);
    assert.match(result.stdout, /## Changes/);
    assert.match(result.stdout, /## Test plan/);
  });

  it("honors --title-only, --body-only, and --json", () => {
    const cwd = makeRepo();
    repos.push(cwd);

    const title = run(cwd, ["--no-ai", "--title-only"]);
    assert.equal(title.status, 0, title.stderr);
    assert.match(title.stdout.trim(), /^(feat|fix|docs|chore|refactor)\b/);
    assert.equal(title.stdout.includes("## Summary"), false);

    const body = run(cwd, ["--no-ai", "--body-only"]);
    assert.equal(body.status, 0, body.stderr);
    assert.match(body.stdout, /^## Summary/m);
    assert.equal(body.stdout.includes("feat("), false);

    const json = run(cwd, ["--no-ai", "--json"]);
    assert.equal(json.status, 0, json.stderr);
    const payload = JSON.parse(json.stdout) as {
      title: string;
      body: string;
      engine: string;
      locale: string;
      base: string;
    };
    assert.equal(payload.engine, "heuristic");
    assert.equal(payload.locale, "en");
    assert.equal(payload.base, "HEAD");
    assert.match(payload.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.match(payload.body, /## Test plan/);
  });

  it("includes locale in --json output", () => {
    const cwd = makeRepo();
    repos.push(cwd);

    const jsonEn = run(cwd, ["--no-ai", "--json", "--locale", "en"]);
    assert.equal(jsonEn.status, 0, jsonEn.stderr);
    const payloadEn = JSON.parse(jsonEn.stdout) as { locale: string };
    assert.equal(payloadEn.locale, "en");

    const jsonZh = run(cwd, ["--no-ai", "--json", "--locale", "zh"]);
    assert.equal(jsonZh.status, 0, jsonZh.stderr);
    const payloadZh = JSON.parse(jsonZh.stdout) as { locale: string };
    assert.equal(payloadZh.locale, "zh");
  });

  it("diffs vs merge-base when --base is set", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    git(cwd, ["add", "src/auth.ts"]);
    git(cwd, ["commit", "-m", "feat: logout"]);
    git(cwd, ["checkout", "-b", "feature"]);
    writeFileSync(
      join(cwd, "src", "session.ts"),
      "export function refresh() { return 1; }\n",
    );
    git(cwd, ["add", "src/session.ts"]);
    git(cwd, ["commit", "-m", "feat: refresh"]);
    writeFileSync(join(cwd, "README.md"), "# demo\n");
    git(cwd, ["add", "README.md"]);

    const result = run(cwd, ["--no-ai", "--base", "main", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as {
      title: string;
      body: string;
      base: string;
    };
    assert.match(payload.base, /merge-base of main/);
    assert.match(payload.body, /session\.ts/);
    assert.match(payload.body, /README\.md/);
  });

  it("prints a suggested gh command with --open", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--title-only", "--open"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /gh pr create --title /);
    assert.match(result.stderr, /--body /);
  });

  it("fails clearly with a clean tree", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    git(cwd, ["reset", "--hard", "HEAD"]);
    git(cwd, ["clean", "-fd"]);
    const result = run(cwd, ["--no-ai"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No changes vs HEAD/);
  });

  it("fails outside a git repository", () => {
    const cwd = mkdtempSync(join(tmpdir(), "diff-vibe-nongit-"));
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    const fail = run(cwd);
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /Not a git repository/);
  });


  it("emits GitHub Actions annotations with --github --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--github", "--quiet"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^::(error|warning|notice) /m);
    assert.match(result.stdout, /diff-vibe · title/);
    assert.equal(result.stdout.includes("::group::"), false);
    assert.equal(result.stdout.includes("## Summary"), false);
  });

  it("keeps --json stdout clean when combined with --github", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--github", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { title: string; engine: string };
    assert.equal(payload.engine, "heuristic");
    assert.match(payload.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.match(result.stderr, /^::(error|warning|notice) /m);
  });

  it("honors --max-annotations with --github", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, [
      "--no-ai",
      "--github",
      "--quiet",
      "--max-annotations",
      "1",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim().split("\n").length, 1);
  });

  it("rejects invalid --max-annotations", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--max-annotations", "0"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /max-annotations/);
  });

  it("suppresses the pretty report with --quiet alone", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai", "--quiet"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "");
  });

  it("writes GITHUB_OUTPUT and GITHUB_STEP_SUMMARY with --github", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outDir = mkdtempSync(join(tmpdir(), "diff-vibe-gh-env-"));
    repos.push(outDir);
    const outputFile = join(outDir, "github_output");
    const summaryFile = join(outDir, "step_summary.md");
    const result = run(cwd, ["--no-ai", "--github", "--quiet"], {
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(outputFile, "utf8");
    assert.match(output, /^title=/m);
    assert.match(output, /^summary=/m);
    assert.match(output, /^findings=\d+$/m);
    const summary = readFileSync(summaryFile, "utf8");
    assert.match(summary, /## diff-vibe/);
  });

  it("prints help and version", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const help = run(cwd, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage/);
    const version = run(cwd, ["--version"]);
    assert.equal(version.status, 0);
    assert.match(version.stdout, /diff-vibe \d+\.\d+\.\d+/);
  });

  it("disables colors with --no-color flag", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const withColor = run(cwd, ["--no-ai"], { NO_COLOR: "" });
    const withoutColor = run(cwd, ["--no-ai", "--no-color"], { NO_COLOR: "" });
    
    assert.equal(withColor.status, 0);
    assert.equal(withoutColor.status, 0);
    
    // Output with --no-color should not contain ANSI escape codes
    assert.equal(withoutColor.stdout.includes("\x1b["), false, "should not contain ANSI codes");
    assert.match(withoutColor.stdout, /feat\(auth\):/);
    assert.match(withoutColor.stdout, /## Summary/);
  });

  it("disables colors with NO_COLOR environment variable", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const result = run(cwd, ["--no-ai"], { NO_COLOR: "1" });
    
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes("\x1b["), false, "should not contain ANSI codes with NO_COLOR=1");
  });

  it("keeps JSON output clean regardless of --no-color", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    
    const withColor = run(cwd, ["--no-ai", "--json"], { NO_COLOR: "" });
    const withoutColor = run(cwd, ["--no-ai", "--json", "--no-color"]);
    
    assert.equal(withColor.status, 0);
    assert.equal(withoutColor.status, 0);
    
    // Both should be valid JSON without ANSI codes
    const payload1 = JSON.parse(withColor.stdout) as { title: string };
    const payload2 = JSON.parse(withoutColor.stdout) as { title: string };
    
    assert.equal(withColor.stdout.includes("\x1b["), false);
    assert.equal(withoutColor.stdout.includes("\x1b["), false);
    assert.match(payload1.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.match(payload2.title, /^(feat|fix|docs|chore|refactor)\b/);
  });

  it("writes report to file with --out (single mode)", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.md");
    const result = run(cwd, ["--no-ai", "--out", outFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "", "stdout should be empty with --out");
    assert.match(result.stderr, /wrote report to/);
    const content = readFileSync(outFile, "utf8");
    assert.match(content, /feat\(auth\): /);
    assert.match(content, /## Summary/);
    assert.match(content, /## Changes/);
  });

  it("writes JSON to both file and stdout with --out --json", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.json");
    const result = run(cwd, ["--no-ai", "--out", outFile, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const stdoutPayload = JSON.parse(result.stdout) as { title: string; engine: string };
    assert.equal(stdoutPayload.engine, "heuristic");
    assert.match(stdoutPayload.title, /^(feat|fix|docs|chore|refactor)\b/);
    const fileContent = readFileSync(outFile, "utf8");
    const filePayload = JSON.parse(fileContent) as { title: string; engine: string };
    assert.equal(filePayload.engine, "heuristic");
    assert.match(filePayload.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.deepEqual(stdoutPayload, filePayload, "file and stdout JSON should match");
  });

  it("suppresses 'wrote report to' message with --out --quiet", () => {
    const cwd = makeRepo();
    repos.push(cwd);
    const outFile = join(cwd, "report.md");
    const result = run(cwd, ["--no-ai", "--out", outFile, "--quiet"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "");
    assert.equal(result.stderr.includes("wrote report to"), false);
    const content = readFileSync(outFile, "utf8");
    assert.match(content, /feat\(auth\): /);
  });

  it("writes suite report to file with --suite --out", () => {
    const suiteDir = mkdtempSync(join(tmpdir(), "diff-vibe-suite-out-"));
    repos.push(suiteDir);
    
    const diff1 = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
 export function login() {
   return true;
 }
+export function logout() {
+  return false;
+}`;
    
    const diff2 = `diff --git a/README.md b/README.md
index 9876543..fedcba9 100644
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-# My Project
+# diff-vibe Project`;
    
    writeFileSync(join(suiteDir, "feat.diff"), diff1);
    writeFileSync(join(suiteDir, "docs.diff"), diff2);
    
    const outFile = join(suiteDir, "report.json");
    const result = run(suiteDir, ["--suite", suiteDir, "--out", outFile, "--no-ai"]);
    
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "", "stdout should be empty with --out (no --json)");
    assert.match(result.stderr, /wrote report to/);
    
    const content = readFileSync(outFile, "utf8");
    const payload = JSON.parse(content) as {
      results: Array<{ file: string; success: boolean }>;
      stats: { total: number; succeeded: number; failed: number };
    };
    
    assert.equal(payload.results.length, 2);
    assert.equal(payload.stats.total, 2);
    assert.equal(payload.stats.succeeded, 2);
  });

  it("writes suite report to both file and stdout with --suite --out --json", () => {
    const suiteDir = mkdtempSync(join(tmpdir(), "diff-vibe-suite-json-"));
    repos.push(suiteDir);
    
    const diff1 = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
 export function login() {
   return true;
 }
+export function logout() {
+  return false;
+}`;
    
    const diff2 = `diff --git a/test/auth.test.ts b/test/auth.test.ts
new file mode 100644
index 0000000..7890abc
--- /dev/null
+++ b/test/auth.test.ts
@@ -0,0 +1,5 @@
+import { login } from '../src/auth';
+
+test('login', () => {
+  expect(login()).toBe(true);
+});`;
    
    writeFileSync(join(suiteDir, "feat.diff"), diff1);
    writeFileSync(join(suiteDir, "test.diff"), diff2);
    
    const outFile = join(suiteDir, "report.json");
    const result = run(suiteDir, ["--suite", suiteDir, "--out", outFile, "--json", "--no-ai"]);
    
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /wrote report to/);
    
    // Check stdout has JSON
    const stdoutPayload = JSON.parse(result.stdout) as {
      results: Array<{ file: string; success: boolean }>;
      stats: { total: number; succeeded: number };
    };
    assert.equal(stdoutPayload.results.length, 2);
    assert.equal(stdoutPayload.stats.total, 2);
    
    // Check file has the same JSON
    const fileContent = readFileSync(outFile, "utf8");
    const filePayload = JSON.parse(fileContent) as typeof stdoutPayload;
    assert.deepEqual(filePayload, stdoutPayload, "file and stdout JSON should match");
  });

  it("suppresses 'wrote report to' with --suite --out --quiet", () => {
    const suiteDir = mkdtempSync(join(tmpdir(), "diff-vibe-suite-quiet-"));
    repos.push(suiteDir);
    
    const diff1 = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
 export function login() {
   return true;
 }
+export function logout() {
+  return false;
+}`;
    
    const diff2 = `diff --git a/README.md b/README.md
index 9876543..fedcba9 100644
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-# My Project
+# diff-vibe Project`;
    
    writeFileSync(join(suiteDir, "feat.diff"), diff1);
    writeFileSync(join(suiteDir, "docs.diff"), diff2);
    
    const outFile = join(suiteDir, "report.json");
    const result = run(suiteDir, ["--suite", suiteDir, "--out", outFile, "--quiet", "--no-ai"]);
    
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "");
    assert.equal(result.stderr.includes("wrote report to"), false);
    
    const content = readFileSync(outFile, "utf8");
    const payload = JSON.parse(content);
    assert.equal(payload.results.length, 2);
  });
});
