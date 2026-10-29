import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyVibe, pick } from "../src/vibe.ts";

describe("applyVibe", () => {
  const draft = {
    type: "feat" as const,
    scope: "cli",
    subject: "add offline heuristic pr drafts",
    summary:
      "Add offline heuristic pr drafts in cli. 1 file in this diff (+80 / −0).",
    breaking: false,
  };

  it("keeps a calm subject and summary", () => {
    const result = applyVibe(draft, "calm");
    assert.equal(result.subject, draft.subject);
    assert.equal(result.summary, draft.summary);
  });

  it("shortens dry subjects", () => {
    const result = applyVibe(draft, "dry");
    assert.ok(result.subject.length <= 50);
    assert.equal(result.subject.includes(" the "), false);
  });

  it("keeps punchy output as a usable conventional subject", () => {
    const result = applyVibe(draft, "punchy");
    assert.ok(result.subject.length > 0);
    assert.ok(result.subject.length <= 72);
    assert.equal(result.subject.endsWith("."), false);
  });
});

describe("pick", () => {
  it("is deterministic for a given seed", () => {
    const options = ["alpha", "beta", "gamma"];
    assert.equal(pick("seed", options), pick("seed", options));
    assert.notEqual(pick("seed-a", options), undefined);
  });
});
