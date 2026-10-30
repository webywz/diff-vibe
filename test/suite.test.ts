import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runSuite } from "../src/suite.ts";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempSuite(): string {
  const dir = mkdtempSync(join(tmpdir(), "diff-vibe-suite-"));
  tempDirs.push(dir);
  return dir;
}

const FEAT_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,12 @@
 export function login(username: string, password: string): boolean {
-  // TODO: implement
-  return false;
+  if (!username || !password) {
+    return false;
+  }
+  return true;
+}
+
+export function logout(): void {
+  sessionStorage.clear();
 }
`;

const FIX_DIFF = `diff --git a/README.md b/README.md
index 9876543..fedcba9 100644
--- a/README.md
+++ b/README.md
@@ -1,7 +1,7 @@
 # My Project
 
-A simle project for testing.
+A simple project for testing.
 
 ## Features
`;

const TEST_DIFF = `diff --git a/test/auth.test.ts b/test/auth.test.ts
new file mode 100644
index 0000000..7890abc
--- /dev/null
+++ b/test/auth.test.ts
@@ -0,0 +1,10 @@
+import { describe, it, expect } from 'vitest';
+import { login } from '../src/auth';
+
+describe('auth', () => {
+  it('should work', () => {
+    expect(login('user', 'pass')).toBe(true);
+  });
+});
`;

describe("suite", () => {
  it("processes multiple diff files and returns aggregated results", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "feat-auth.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "fix-typo.diff"), FIX_DIFF);
    writeFileSync(join(dir, "test-auth.diff"), TEST_DIFF);

    const result = await runSuite({
      pattern: dir,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 3);
    assert.equal(result.stats.total, 3);
    assert.equal(result.stats.succeeded, 3);
    assert.equal(result.stats.failed, 0);

    const types = result.results.map((r) => r.proposal?.type).sort();
    assert(types.includes("feat"));
    assert(types.includes("fix") || types.includes("docs"));
    assert(types.includes("test"));

    const byType = result.stats.byType;
    assert(byType.feat > 0 || byType.test > 0 || byType.fix > 0);
  });

  it("requires at least 2 diff files", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "single.diff"), FEAT_DIFF);

    await assert.rejects(
      async () =>
        runSuite({
          pattern: dir,
          vibe: "calm",
          locale: "en",
          preferAi: false,
        }),
      /requires ≥2 diff files/,
    );
  });

  it("supports glob patterns", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "feat-one.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "feat-two.diff"), FIX_DIFF);
    writeFileSync(join(dir, "ignored.txt"), "not a diff");

    const result = await runSuite({
      pattern: `${dir}/*.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.stats.total, 2);
  });

  it("tracks failed diffs in stats", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "good.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "bad.diff"), "not a valid diff");

    const result = await runSuite({
      pattern: dir,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.stats.failed, 1);
    assert.equal(result.stats.succeeded, 1);

    const failed = result.results.find((r) => !r.success);
    assert(failed);
    assert(failed.error);
  });

  it("includes engine stats", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "one.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "two.diff"), FIX_DIFF);

    const result = await runSuite({
      pattern: dir,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert(result.stats.byEngine.heuristic >= 2);
    assert.equal(result.stats.byEngine.ai, 0);
  });

  it("handles nested directories", async () => {
    const dir = makeTempSuite();
    const subdir = join(dir, "nested");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(dir, "top.diff"), FEAT_DIFF);
    writeFileSync(join(subdir, "bottom.diff"), FIX_DIFF);

    const result = await runSuite({
      pattern: dir,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
  });

  it("respects vibe and locale options", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "one.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "two.diff"), FIX_DIFF);

    const result = await runSuite({
      pattern: dir,
      vibe: "punchy",
      locale: "zh",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
    for (const item of result.results) {
      if (item.success && item.proposal) {
        assert.equal(item.proposal.locale, "zh");
      }
    }
  });

  it("expands simple braces {a,b}", async () => {
    const dir = makeTempSuite();
    const subA = join(dir, "a");
    const subB = join(dir, "b");
    mkdirSync(subA, { recursive: true });
    mkdirSync(subB, { recursive: true });
    writeFileSync(join(subA, "one.diff"), FEAT_DIFF);
    writeFileSync(join(subB, "two.diff"), FIX_DIFF);

    const result = await runSuite({
      pattern: `${dir}/{a,b}/*.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.stats.succeeded, 2);
  });

  it("expands nested braces", async () => {
    const dir = makeTempSuite();
    const subA = join(dir, "a");
    const subB = join(dir, "b");
    const subC = join(dir, "c");
    mkdirSync(subA, { recursive: true });
    mkdirSync(subB, { recursive: true });
    mkdirSync(subC, { recursive: true });
    writeFileSync(join(subA, "feat.diff"), FEAT_DIFF);
    writeFileSync(join(subB, "fix.diff"), FIX_DIFF);
    writeFileSync(join(subC, "test.diff"), TEST_DIFF);

    const result = await runSuite({
      pattern: `${dir}/{a,{b,c}}/*.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 3);
    assert.equal(result.stats.succeeded, 3);
  });

  it("handles empty braces gracefully", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "one.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "two.diff"), FIX_DIFF);

    const result = await runSuite({
      pattern: `${dir}{}/*.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
  });

  it("supports brace expansion with specific filenames", async () => {
    const dir = makeTempSuite();
    writeFileSync(join(dir, "good.diff"), FEAT_DIFF);
    writeFileSync(join(dir, "bad.diff"), FIX_DIFF);
    writeFileSync(join(dir, "other.diff"), TEST_DIFF);

    const result = await runSuite({
      pattern: `${dir}/{good,bad}.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert.equal(result.results.length, 2);
    const files = result.results.map((r) => r.file).sort();
    assert(files.some((f) => f.endsWith("good.diff")));
    assert(files.some((f) => f.endsWith("bad.diff")));
  });

  it("combines braces with wildcards", async () => {
    const dir = makeTempSuite();
    const feat = join(dir, "feat");
    const fix = join(dir, "fix");
    mkdirSync(feat, { recursive: true });
    mkdirSync(fix, { recursive: true });
    writeFileSync(join(feat, "auth.diff"), FEAT_DIFF);
    writeFileSync(join(feat, "api.diff"), FIX_DIFF);
    writeFileSync(join(fix, "typo.diff"), TEST_DIFF);

    const result = await runSuite({
      pattern: `${dir}/{feat,fix}/*.diff`,
      vibe: "calm",
      locale: "en",
      preferAi: false,
    });

    assert(result.results.length >= 2);
    assert.equal(result.stats.succeeded, result.results.length);
  });
});
