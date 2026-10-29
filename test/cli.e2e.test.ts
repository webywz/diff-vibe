import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      base: string;
    };
    assert.equal(payload.engine, "heuristic");
    assert.equal(payload.base, "HEAD");
    assert.match(payload.title, /^(feat|fix|docs|chore|refactor)\b/);
    assert.match(payload.body, /## Test plan/);
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
});
