import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultVibeFromEnv,
  parseArgs,
  UsageError,
} from "../src/parse-args.ts";

describe("parseArgs", () => {
  it("defaults to calm vibe and full output", () => {
    const options = parseArgs([], {});
    assert.equal(options.vibe, "calm");
    assert.equal(options.titleOnly, false);
    assert.equal(options.bodyOnly, false);
    assert.equal(options.json, false);
    assert.equal(options.copy, false);
    assert.equal(options.open, false);
    assert.equal(options.create, false);
    assert.equal(options.update, false);
    assert.equal(options.draft, false);
    assert.equal(options.noAi, false);
    assert.equal(options.base, undefined);
  });

  it("parses long flags and equals syntax", () => {
    const options = parseArgs(
      [
        "--base=main",
        "--title-only",
        "--json",
        "--copy",
        "--open",
        "--create",
        "--draft",
        "--vibe",
        "punchy",
        "--no-ai",
      ],
      {},
    );
    assert.deepEqual(
      {
        base: options.base,
        titleOnly: options.titleOnly,
        json: options.json,
        copy: options.copy,
        open: options.open,
        create: options.create,
        update: options.update,
        draft: options.draft,
        vibe: options.vibe,
        noAi: options.noAi,
      },
      {
        base: "main",
        titleOnly: true,
        json: true,
        copy: true,
        open: true,
        create: true,
        update: false,
        draft: true,
        vibe: "punchy",
        noAi: true,
      },
    );
  });

  it("parses --update and rejects create+update / draft without create", () => {
    const options = parseArgs(["--update"], {});
    assert.equal(options.update, true);
    assert.equal(options.create, false);
    assert.throws(() => parseArgs(["--create", "--update"], {}), UsageError);
    assert.throws(() => parseArgs(["--update", "--draft"], {}), UsageError);
    assert.throws(() => parseArgs(["--draft"], {}), UsageError);
  });

  it("treats bare --base as auto-detect", () => {
    const options = parseArgs(["--base", "--json"], {});
    assert.equal(options.base, "auto");
    assert.equal(options.json, true);
  });

  it("reads vibe from env when flag is omitted", () => {
    assert.equal(parseArgs([], { VIBE: "dry" }).vibe, "dry");
    assert.equal(parseArgs([], { DIFF_VIBE_VIBE: "punchy" }).vibe, "punchy");
  });

  it("rejects unknown flags, bad vibes, and mixed output flags", () => {
    assert.throws(() => parseArgs(["--wat"], {}), UsageError);
    assert.throws(() => parseArgs(["--vibe", "chaotic"], {}), UsageError);
    assert.throws(() => parseArgs(["extra"], {}), UsageError);
    assert.throws(
      () => parseArgs(["--title-only", "--body-only"], {}),
      UsageError,
    );
    assert.throws(() => parseArgs(["--draft"], {}), UsageError);
  });
});

describe("defaultVibeFromEnv", () => {
  it("falls back to calm for unknown values", () => {
    assert.equal(defaultVibeFromEnv({ VIBE: "LOUD" }), "calm");
  });
});
