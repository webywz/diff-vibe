import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { proposeWithAi } from "../src/ai.ts";
import { proposePr } from "../src/propose.ts";
import { diffFile, gitDiff } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const diff = gitDiff([
  diffFile({ path: "src/cli.ts", status: "A", additions: 20, deletions: 0 }),
]);

describe("proposeWithAi", () => {
  it("returns null when no API key is set", async () => {
    const result = await proposeWithAi(
      { diff, vibe: "calm" },
      { OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    );
    assert.equal(result, null);
  });

  it("parses an OpenAI-compatible response", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "feat(cli): add a snappy pr writer",
                  summary: "Turn diffs into PR drafts.",
                  changes: ["Add `src/cli.ts`"],
                  testPlan: ["Run --help"],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    const result = await proposeWithAi(
      { diff, vibe: "calm" },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result?.engine, "ai");
    assert.equal(result?.type, "feat");
    assert.equal(result?.scope, "cli");
    assert.match(result?.body ?? "", /## Summary/);
    assert.match(result?.title ?? "", /feat\(cli\):/);
  });

  it("parses an Anthropic response", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                title: "fix(parser): handle empty hunks",
                summary: "Stop crashing on empty diffs.",
                changes: ["Update `src/parser.ts`"],
                testPlan: ["Feed it nothing."],
              }),
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    const result = await proposeWithAi(
      { diff, vibe: "calm" },
      { ANTHROPIC_API_KEY: "sk-ant-test" },
    );
    assert.equal(result?.engine, "ai");
    assert.equal(result?.type, "fix");
    assert.equal(result?.scope, "parser");
  });

  it("falls back when the provider errors", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as typeof fetch;
    const result = await proposeWithAi(
      { diff, vibe: "calm" },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result, null);
  });
});

describe("proposePr", () => {
  it("uses the heuristic when AI is disabled", async () => {
    const result = await proposePr(
      diff,
      { vibe: "calm", preferAi: false },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result.engine, "heuristic");
  });

  it("uses the heuristic when no keys are set", async () => {
    const result = await proposePr(
      diff,
      { vibe: "calm", preferAi: true },
      { OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    );
    assert.equal(result.engine, "heuristic");
  });
});
