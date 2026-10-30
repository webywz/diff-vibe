import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPr } from "../src/format.ts";
import {
  inferScope,
  inferSubject,
  inferType,
  proposeHeuristic,
  stem,
} from "../src/heuristic.ts";
import { addedLines, diffFile, gitDiff, statuses } from "./helpers.ts";

describe("inferType", () => {
  it("classifies documentation-only changes as docs", () => {
    const diff = gitDiff([
      diffFile({ path: "README.md", additions: 20, deletions: 3 }),
    ]);
    assert.equal(inferType(diff), "docs");
  });

  it("classifies test files as test", () => {
    const diff = gitDiff([
      diffFile({ path: "test/format.test.ts", status: statuses.add }),
    ]);
    assert.equal(inferType(diff), "test");
  });

  it("classifies GitHub workflows as ci", () => {
    const diff = gitDiff([
      diffFile({ path: ".github/workflows/ci.yml", additions: 40 }),
    ]);
    assert.equal(inferType(diff), "ci");
  });

  it("classifies package manifests as chore", () => {
    const diff = gitDiff([
      diffFile({ path: "package.json" }),
      diffFile({ path: "package-lock.json", additions: 80, deletions: 12 }),
    ]);
    assert.equal(inferType(diff), "chore");
  });

  it("uses feat for new source files", () => {
    const diff = gitDiff(
      [
        diffFile({
          path: "src/auth.ts",
          status: statuses.add,
          additions: 40,
          deletions: 0,
        }),
      ],
      [addedLines("src/auth.ts", "export function login() {\n  return true;\n}")],
    );
    assert.equal(inferType(diff), "feat");
  });

  it("detects fix from comment keywords, not from regex source", () => {
    const commented = gitDiff(
      [diffFile({ path: "src/parser.ts" })],
      [
        addedLines(
          "src/parser.ts",
          "// fix crash on empty hunks\nif (!header) return [];",
        ),
      ],
    );
    assert.equal(inferType(commented), "fix");

    const regexSource = gitDiff(
      [diffFile({ path: "src/heuristic.ts", status: statuses.add })],
      [
        addedLines(
          "src/heuristic.ts",
          'const FIX_WORD_RE = /\\b(fix|bug)\\b/i;\nexport function inferType() {}',
        ),
      ],
    );
    assert.equal(inferType(regexSource), "feat");
  });

  it("detects refactor from rename-only changes", () => {
    const diff = gitDiff([
      diffFile({
        path: "src/format.ts",
        fromPath: "src/fmt.ts",
        status: statuses.rename,
      }),
    ]);
    assert.equal(inferType(diff), "refactor");
  });

  it("prefers feat over docs when source and readme both change", () => {
    const diff = gitDiff([
      diffFile({
        path: "src/cli.ts",
        status: statuses.add,
        additions: 30,
        deletions: 0,
      }),
      diffFile({ path: "README.md", additions: 12, deletions: 2 }),
    ]);
    assert.equal(inferType(diff), "feat");
  });
});

describe("inferScope", () => {
  it("uses a shared directory under src", () => {
    assert.equal(
      inferScope([
        diffFile({ path: "src/auth/login.ts" }),
        diffFile({ path: "src/auth/session.ts" }),
      ]),
      "auth",
    );
  });

  it("uses the module name for a single src file", () => {
    assert.equal(inferScope([diffFile({ path: "src/auth.ts" })]), "auth");
  });

  it("uses the package name in a workspace", () => {
    assert.equal(
      inferScope([diffFile({ path: "packages/cli/src/main.ts" })]),
      "cli",
    );
  });

  it("omits scope when files are scattered", () => {
    assert.equal(
      inferScope([
        diffFile({ path: "src/auth/a.ts" }),
        diffFile({ path: "src/git/b.ts" }),
        diffFile({ path: "src/ui/c.ts" }),
      ]),
      undefined,
    );
  });
});

describe("inferSubject", () => {
  it("uses added identifiers for new APIs", () => {
    const diff = gitDiff(
      [diffFile({ path: "src/auth.ts", status: statuses.add })],
      [addedLines("src/auth.ts", "export function refreshToken() {}")],
    );
    assert.equal(inferSubject(diff, "feat", "auth", "en"), "add refresh token");
  });

  it("generates Chinese subjects when locale is zh", () => {
    const diff = gitDiff(
      [diffFile({ path: "src/auth.ts", status: statuses.add })],
      [addedLines("src/auth.ts", "export function refreshToken() {}")],
    );
    assert.equal(inferSubject(diff, "feat", "auth", "zh"), "添加 refresh token");
  });

  it("describes a single added file", () => {
    const diff = gitDiff([
      diffFile({
        path: "src/heuristic.ts",
        status: statuses.add,
        deletions: 0,
      }),
    ]);
    assert.equal(inferSubject(diff, "feat", undefined, "en"), "add heuristic");
  });

  it("describes a rename", () => {
    const diff = gitDiff([
      diffFile({
        path: "src/parse-args.ts",
        fromPath: "src/args.ts",
        status: statuses.rename,
      }),
    ]);
    assert.equal(inferSubject(diff, "refactor", undefined, "en"), "rename args to parse args");
  });

  it("uses update readme for documentation", () => {
    const diff = gitDiff([diffFile({ path: "README.md" })]);
    assert.equal(inferSubject(diff, "docs", undefined, "en"), "update readme");
  });
});

describe("proposeHeuristic", () => {
  it("returns a conventional PR title and markdown body", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff(
        [
          diffFile({
            path: "src/auth/login.ts",
            status: statuses.add,
            additions: 40,
            deletions: 0,
          }),
        ],
        [addedLines("src/auth/login.ts", "export function login() {}")],
      ),
      vibe: "calm",
      locale: "en",
    });
    assert.match(proposal.title, /^feat\(auth\): /);
    assert.equal(proposal.engine, "heuristic");
    assert.equal(proposal.locale, "en");
    assert.match(proposal.body, /^## Summary/m);
    assert.match(proposal.body, /^## Changes/m);
    assert.match(proposal.body, /^## Test plan/m);
    assert.match(proposal.body, /Add `src\/auth\/login\.ts`/);
    const formatted = formatPr(proposal);
    assert.equal(formatted.startsWith(proposal.title), true);
  });

  it("generates Chinese PR body when locale is zh", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff(
        [
          diffFile({
            path: "src/auth/login.ts",
            status: statuses.add,
            additions: 40,
            deletions: 0,
          }),
        ],
        [addedLines("src/auth/login.ts", "export function login() {}")],
      ),
      vibe: "calm",
      locale: "zh",
    });
    assert.match(proposal.title, /^feat\(auth\): /);
    assert.equal(proposal.engine, "heuristic");
    assert.equal(proposal.locale, "zh");
    assert.match(proposal.body, /## Summary/m);
    assert.match(proposal.body, /添加/);
    assert.match(proposal.body, /个文件/);
  });

  it("summarizes a brand-new multi-file tree without overfit identifiers", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff([
        diffFile({ path: "src/a.ts", status: statuses.add, deletions: 0 }),
        diffFile({ path: "src/b.ts", status: statuses.add, deletions: 0 }),
        diffFile({ path: "src/c.ts", status: statuses.add, deletions: 0 }),
        diffFile({ path: "README.md", status: statuses.add, deletions: 0 }),
      ]),
      vibe: "calm",
      locale: "en",
    });
    assert.equal(proposal.type, "feat");
    assert.equal(proposal.subject, "add initial implementation");
    assert.match(proposal.body, /## Summary/);
  });

  it("marks breaking only from an added conventional footer", () => {
    const noisy = proposeHeuristic({
      diff: gitDiff(
        [diffFile({ path: "src/format.ts" })],
        [
          addedLines(
            "src/format.ts",
            'const hint = "BREAKING CHANGE in docs";\nexport function formatCommit() {}',
          ),
        ],
      ),
      vibe: "calm",
      locale: "en",
    });
    assert.equal(noisy.breaking, false);

    const footer = proposeHeuristic({
      diff: gitDiff(
        [diffFile({ path: "CHANGELOG.md" })],
        [addedLines("CHANGELOG.md", "BREAKING CHANGE: drop Node 16")],
      ),
      vibe: "calm",
      locale: "en",
    });
    assert.equal(footer.breaking, true);
    assert.match(footer.title, /!/);
  });

  it("keeps a short dry body with the same three sections", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff([
        diffFile({ path: "src/a.ts" }),
        diffFile({ path: "src/b.ts" }),
        diffFile({ path: "src/c.ts" }),
      ]),
      vibe: "dry",
      locale: "en",
    });
    assert.match(proposal.body, /## Summary/);
    assert.match(proposal.body, /## Changes/);
    assert.match(proposal.body, /## Test plan/);
    assert.match(proposal.changes[0] ?? "", /^`src\/a\.ts`$/);
  });

  it("adds a test-plan hint for CLI files", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff([
        diffFile({ path: "src/cli.ts", status: statuses.add, additions: 80 }),
      ]),
      vibe: "calm",
      locale: "en",
    });
    assert.ok(
      proposal.testPlan.some((item) => /--help/.test(item)),
      proposal.testPlan.join(" | "),
    );
  });

  it("suggests reproducing a bug on fix diffs", () => {
    const proposal = proposeHeuristic({
      diff: gitDiff(
        [diffFile({ path: "src/parser.ts" })],
        [addedLines("src/parser.ts", "// fix crash on empty hunks")],
      ),
      vibe: "calm",
      locale: "en",
    });
    assert.equal(proposal.type, "fix");
    assert.ok(proposal.testPlan.some((item) => /Reproduce/.test(item)));
  });
});

describe("stem", () => {
  it("humanizes PascalCase and index files", () => {
    assert.equal(stem("src/AuthButton.tsx"), "auth button");
    assert.equal(stem("src/parser/index.ts"), "parser");
  });
});
