import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clip,
  formatBody,
  formatPr,
  formatTitle,
  normalizeSubject,
  parseAiDraft,
  shQuote,
  suggestGhPrCreate,
} from "../src/format.ts";
import type { ProposedPr } from "../src/types.ts";

function proposal(partial: Partial<ProposedPr> = {}): ProposedPr {
  return {
    title: "feat(auth): add login",
    body: "## Summary\n\nAdd login.\n\n## Changes\n\n- Add `src/auth.ts`\n\n## Test plan\n\n- Hit the happy path.",
    type: "feat",
    scope: "auth",
    subject: "add login",
    summary: "Add login.",
    changes: ["Add `src/auth.ts`"],
    testPlan: ["Hit the happy path."],
    breaking: false,
    engine: "heuristic",
    ...partial,
  };
}

describe("formatTitle", () => {
  it("formats type, scope, and breaking marker", () => {
    assert.equal(
      formatTitle({
        type: "feat",
        scope: "auth",
        subject: "add login",
        breaking: false,
      }),
      "feat(auth): add login",
    );
    assert.equal(
      formatTitle({
        type: "feat",
        subject: "add login",
        breaking: true,
      }),
      "feat!: add login",
    );
  });
});

describe("formatBody", () => {
  it("always emits Summary, Changes, and Test plan", () => {
    const body = formatBody({
      summary: "Add login in auth.",
      changes: ["Add `src/auth.ts` (+40 −0)"],
      testPlan: ["Run `npm test`."],
    });
    assert.match(body, /^## Summary\n\nAdd login in auth\./m);
    assert.match(body, /^## Changes\n\n- Add `src\/auth\.ts`/m);
    assert.match(body, /^## Test plan\n\n- Run `npm test`\./m);
  });
});

describe("formatPr", () => {
  it("joins title and body with a blank line", () => {
    const formatted = formatPr(proposal());
    assert.equal(formatted.startsWith("feat(auth): add login\n\n## Summary"), true);
  });
});

describe("normalizeSubject", () => {
  it("lowercases a leading capital, strips a trailing period, and collapses space", () => {
    assert.equal(normalizeSubject("  Add Login.  "), "add Login");
  });

  it("keeps ALLCAPS tokens", () => {
    assert.equal(normalizeSubject("Fix JWT refresh"), "fix JWT refresh");
  });
});

describe("parseAiDraft", () => {
  it("parses JSON from a model", () => {
    const parsed = parseAiDraft(
      JSON.stringify({
        title: "fix(parser): handle empty hunks",
        summary: "Avoid crashing on binary files.",
        changes: ["Update `src/parser.ts`"],
        testPlan: ["Feed it an empty hunk."],
      }),
    );
    assert.equal(parsed?.type, "fix");
    assert.equal(parsed?.scope, "parser");
    assert.equal(parsed?.subject, "handle empty hunks");
    assert.equal(parsed?.summary, "Avoid crashing on binary files.");
    assert.deepEqual(parsed?.testPlan, ["Feed it an empty hunk."]);
  });

  it("reads fenced JSON", () => {
    const parsed = parseAiDraft(
      "```json\n{\"title\":\"feat: add heuristic engine\",\"summary\":\"Offline PR drafts.\"}\n```",
    );
    assert.equal(parsed?.type, "feat");
    assert.equal(parsed?.subject, "add heuristic engine");
  });

  it("returns null for unstructured text", () => {
    assert.equal(parseAiDraft("just a sentence"), null);
  });
});

describe("helpers", () => {
  it("clips on a word boundary", () => {
    const long =
      "update the authentication session refresh token rotation helper";
    const clipped = clip(long, 40);
    assert.ok(clipped.length <= 40);
    assert.ok(clipped.endsWith("…"));
  });

  it("shell-quotes a suggested gh command", () => {
    const command = suggestGhPrCreate("feat: add x", "it's fine");
    assert.equal(
      command,
      "gh pr create --title 'feat: add x' --body 'it'\\''s fine'",
    );
    assert.equal(shQuote("plain"), "'plain'");
  });
});
