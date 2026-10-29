import { clip } from "./format.ts";
import type { CommitType, Vibe } from "./types.ts";

export interface VibeDraft {
  type: CommitType;
  scope?: string;
  subject: string;
  summary: string;
  breaking: boolean;
}

export function applyVibe(draft: VibeDraft, vibe: Vibe): VibeDraft {
  return {
    ...draft,
    subject: stylizeSubject(draft, vibe),
    summary: stylizeSummary(draft, vibe),
  };
}

function stylizeSubject(draft: VibeDraft, vibe: Vibe): string {
  const core = draft.subject.trim();
  if (vibe === "dry") return clip(stripFiller(core), 50);
  if (vibe === "calm") return clip(core, 72);
  return clip(punchySubject(draft.type, core), 72);
}

function stylizeSummary(draft: VibeDraft, vibe: Vibe): string {
  const core = draft.summary.replace(/\s+/g, " ").trim();
  if (vibe === "dry") return clip(stripFiller(core), 120);
  if (vibe === "calm") return core;
  const extra = punchySummaryNote(draft.type);
  if (!extra || core.includes(extra)) return core;
  return `${core} ${extra}`;
}

function stripFiller(text: string): string {
  return text
    .replace(/\b(the|a|an|that|which|with|from|into)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function punchySubject(type: CommitType, core: string): string {
  return pick(`${type}:${core}`, punchyOptions(type, core));
}

function punchyOptions(type: CommitType, core: string): string[] {
  switch (type) {
    case "feat":
      return [
        core,
        `ship ${core.replace(/^add\s+/, "")}`,
        `${core} — quietly useful`,
        `give the repo ${core.replace(/^add\s+/, "")}`,
      ];
    case "fix":
      return [
        core,
        `stop the ${core.replace(/^fix\s+/, "")} weirdness`,
        `patch ${core.replace(/^fix\s+/, "")} before it spreads`,
        `${core} (the unglamorous kind)`,
      ];
    case "docs":
      return [
        core,
        `tell humans about ${core.replace(/^update\s+/, "").replace(/^document\s+/, "")}`,
        `${core} so future-us remembers`,
      ];
    case "refactor":
      return [
        core,
        `tidy ${core.replace(/^refactor\s+/, "")} without changing the plot`,
        `${core} — same behavior, less fog`,
      ];
    case "test":
      return [
        core,
        `make ${core.replace(/^add\s+/, "").replace(/^test\s+/, "")} prove itself`,
        `${core} so regressions can't hide`,
      ];
    case "chore":
      return [
        core,
        `keep ${core.replace(/^update\s+/, "")} in fighting shape`,
        `${core} (housekeeping)`,
      ];
    case "ci":
      return [
        core,
        `keep CI honest: ${core.replace(/^update\s+/, "")}`,
        `${core} so green means green`,
      ];
    case "perf":
      return [
        core,
        `make ${core.replace(/^improve\s+/, "")} snappier`,
        `${core} — fewer wasted cycles`,
      ];
    default:
      return [core];
  }
}

function punchySummaryNote(type: CommitType): string {
  switch (type) {
    case "feat":
      return "Shipped with a straight face; the fun is in the details.";
    case "fix":
      return "Less mystery, more green tests.";
    case "docs":
      return "Written for the next person who is, statistically, you.";
    case "refactor":
      return "Same plot, less fog.";
    default:
      return "";
  }
}

export function pick(seed: string, options: string[]): string {
  if (options.length === 0) return "";
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % options.length;
  return options[index] ?? options[0] ?? "";
}
