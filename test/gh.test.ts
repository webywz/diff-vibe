import assert from "node:assert/strict";
import type { SpawnSyncReturns } from "node:child_process";
import { describe, it } from "node:test";
import { createPrWithGh } from "../src/gh.ts";

function fake(
  status: number | null,
  opts: { stdout?: string; stderr?: string; error?: NodeJS.ErrnoException } = {},
): SpawnSyncReturns<string> {
  return {
    status,
    stdout: opts.stdout ?? "",
    stderr: opts.stderr ?? "",
    pid: 1,
    output: [null, opts.stdout ?? "", opts.stderr ?? ""],
    signal: null,
    error: opts.error,
  };
}

describe("createPrWithGh", () => {
  it("passes title, body, and optional draft to gh", () => {
    const calls: { command: string; args: string[] }[] = [];
    const result = createPrWithGh({
      title: "feat: x",
      body: "## Summary\nok",
      draft: true,
      runner: (command, args) => {
        calls.push({ command, args });
        return fake(0, { stdout: "https://github.com/acme/repo/pull/1\n" });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://github.com/acme/repo/pull/1");
    assert.deepEqual(calls[0], {
      command: "gh",
      args: [
        "pr",
        "create",
        "--title",
        "feat: x",
        "--body",
        "## Summary\nok",
        "--draft",
      ],
    });
  });

  it("reports missing gh and still returns the printable command", () => {
    const err = Object.assign(new Error("spawn gh ENOENT"), {
      code: "ENOENT",
    }) as NodeJS.ErrnoException;
    const result = createPrWithGh({
      title: "feat: x",
      body: "body",
      runner: () => fake(null, { error: err }),
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /gh not found/);
    assert.match(result.suggestedCommand, /gh pr create --title /);
  });

  it("surfaces gh stderr on failure", () => {
    const result = createPrWithGh({
      title: "feat: x",
      body: "body",
      runner: () => fake(1, { stderr: "GraphQL: Head ref must exist" }),
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /Head ref must exist/);
  });
});
