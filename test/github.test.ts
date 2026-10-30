import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  annotation,
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  escapeData,
  escapeProperty,
  formatGitHubAnnotations,
  formatGitHubStepSummary,
  proposalAnnotationType,
} from "../src/github.ts";
import type { InspectedDiff, ProposedPr } from "../src/types.ts";
import { diffFile, gitDiff } from "./helpers.ts";

function sampleProposal(partial: Partial<ProposedPr> = {}): ProposedPr {
  return {
    title: "feat(auth): add logout",
    body: "## Summary\nAdd logout.\n",
    type: "feat",
    scope: "auth",
    subject: "add logout",
    summary: "Add logout in auth. 1 file in this diff (+8 / −0).",
    changes: ["- Add `src/auth.ts` (+8 −0)"],
    testPlan: ["- Hit the happy path once."],
    breaking: false,
    engine: "heuristic",
    ...partial,
  };
}

function sampleInspected(partial: Partial<InspectedDiff> = {}): InspectedDiff {
  return {
    diff: gitDiff([diffFile({ path: "src/auth.ts", status: "M", additions: 8, deletions: 0 })]),
    rangeLabel: "HEAD",
    ...partial,
  };
}

describe("github annotations", () => {
  it("escapes workflow command payloads", () => {
    assert.equal(escapeData("a%b\nc\rd"), "a%25b%0Ac%0Dd");
    assert.equal(escapeProperty("file:name,path"), "file%3Aname%2Cpath");
  });

  it("formats a basic annotation line", () => {
    assert.equal(
      annotation("warning", "hello\nworld", { file: "a.ts", line: 3, title: "t:1,2" }),
      "::warning file=a.ts,line=3,title=t%3A1%2C2::hello%0Aworld",
    );
  });

  it("maps breaking / fix to heavier annotation types", () => {
    assert.equal(proposalAnnotationType(sampleProposal({ breaking: true })), "error");
    assert.equal(proposalAnnotationType(sampleProposal({ type: "fix", breaking: false })), "warning");
    assert.equal(proposalAnnotationType(sampleProposal({ type: "feat" })), "notice");
  });

  it("emits title / summary / change annotations", () => {
    const out = formatGitHubAnnotations(sampleProposal(), sampleInspected());
    assert.match(out, /^::(error|warning|notice) /m);
    assert.match(out, /diff-vibe · title/);
    assert.match(out, /feat\(auth\): add logout/);
    assert.match(out, /diff-vibe · change/);
    for (const line of out.trim().split("\n")) {
      assert.match(line, /^::(error|warning|notice) /);
    }
  });

  it("emits breaking as error", () => {
    const out = formatGitHubAnnotations(
      sampleProposal({ breaking: true, title: "feat(auth)!: drop sessions" }),
      sampleInspected(),
    );
    assert.match(out, /::error /);
    assert.match(out, /Breaking change/);
  });

  it("respects maxAnnotations", () => {
    const proposal = sampleProposal({
      changes: [
        "- Add `a.ts`",
        "- Update `b.ts`",
        "- Update `c.ts`",
        "- Update `d.ts`",
        "- Update `e.ts`",
      ],
    });
    const out = formatGitHubAnnotations(proposal, sampleInspected(), {
      maxAnnotations: 2,
    });
    assert.equal(out.trim().split("\n").length, 2);
  });

  it("appends job outputs when GITHUB_OUTPUT is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-vibe-gh-"));
    const outFile = join(dir, "github_output");
    const prev = process.env.GITHUB_OUTPUT;
    try {
      process.env.GITHUB_OUTPUT = outFile;
      const proposal = sampleProposal();
      const inspected = sampleInspected();
      appendGitHubJobOutput(proposal, inspected);
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /^title=feat\(auth\): add logout$/m);
      assert.match(body, /^summary=/m);
      assert.match(body, /^type=feat$/m);
      assert.match(body, /^breaking=false$/m);
      assert.match(body, /^engine=heuristic$/m);
      assert.match(body, /^base=HEAD$/m);
      assert.match(body, /^findings=1$/m);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats a concise step summary", () => {
    const md = formatGitHubStepSummary(sampleProposal(), sampleInspected());
    assert.match(md, /## diff-vibe/);
    assert.match(md, /\*\*Title\*\*/);
    assert.match(md, /Key changes|feat\(auth\)/);
  });

  it("appends step summary when GITHUB_STEP_SUMMARY is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-vibe-gh-sum-"));
    const outFile = join(dir, "step_summary.md");
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      process.env.GITHUB_STEP_SUMMARY = outFile;
      appendGitHubStepSummary(sampleProposal(), sampleInspected());
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /## diff-vibe/);
      assert.match(body, /Title/);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops step summary when GITHUB_STEP_SUMMARY is unset", () => {
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      delete process.env.GITHUB_STEP_SUMMARY;
      appendGitHubStepSummary(sampleProposal(), sampleInspected());
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
    }
  });
});
