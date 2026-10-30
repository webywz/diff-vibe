import { formatBody, formatTitle, parseAiDraft } from "./format.ts";
import type {
  CommitType,
  GitDiff,
  Locale,
  ProposedPr,
  Vibe,
} from "./types.ts";

const MAX_DIFF_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 12_000;

export interface AiContext {
  diff: GitDiff;
  vibe: Vibe;
  locale: Locale;
  type?: CommitType;
  scope?: string;
}

export async function proposeWithAi(
  context: AiContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProposedPr | null> {
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (!openaiKey && !anthropicKey) return null;

  try {
    const content = openaiKey
      ? await completeOpenAi(context, env, openaiKey)
      : await completeAnthropic(context, env, anthropicKey!);
    if (!content) return null;
    return hydrateProposal(content, context);
  } catch {
    return null;
  }
}

async function completeOpenAi(
  context: AiContext,
  env: NodeJS.ProcessEnv,
  apiKey: string,
): Promise<string | null> {
  const baseUrl = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: context.vibe === "punchy" ? 0.7 : 0.2,
      messages: [
        { role: "system", content: systemPrompt(context.vibe, context.locale) },
        { role: "user", content: userPrompt(context) },
      ],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? null;
}

async function completeAnthropic(
  context: AiContext,
  env: NodeJS.ProcessEnv,
  apiKey: string,
): Promise<string | null> {
  const model = env.ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-latest";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: context.vibe === "punchy" ? 0.7 : 0.2,
      system: systemPrompt(context.vibe, context.locale),
      messages: [{ role: "user", content: userPrompt(context) }],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const block = payload.content?.find((entry) => entry.type === "text");
  return block?.text ?? null;
}

function hydrateProposal(
  content: string,
  context: AiContext,
): ProposedPr | null {
  const parsed = parseAiDraft(content, "ai");
  if (!parsed?.summary && !parsed?.title) return null;

  const type = context.type ?? parsed.type ?? "feat";
  const scope = context.scope ?? parsed.scope;
  const subject = parsed.subject || (context.locale === "zh" ? "更新项目文件" : "update project files");
  const breaking = parsed.breaking ?? false;
  const title = formatTitle({
    type,
    scope,
    subject,
    breaking,
  });
  const summary = parsed.summary?.trim() || subject;
  const changes = parsed.changes?.length
    ? parsed.changes
    : context.diff.files.slice(0, 8).map((file) => `\`${file.path}\``);
  const defaultTestPlan = context.locale === "zh" 
    ? "重读 diff，对主路径进行完整性检查。"
    : "Re-read the diff and sanity-check the main path.";
  const testPlan = parsed.testPlan?.length
    ? parsed.testPlan
    : [defaultTestPlan];
  const body = formatBody({ summary, changes, testPlan });
  return {
    title: parsed.title && looksLikeTitle(parsed.title) ? parsed.title : title,
    body,
    type,
    scope,
    subject,
    summary,
    changes,
    testPlan,
    breaking,
    engine: "ai",
    locale: context.locale,
  };
}

function looksLikeTitle(value: string): boolean {
  return value.length > 0 && value.length <= 90 && !value.includes("\n");
}

function systemPrompt(vibe: Vibe, locale: Locale): string {
  const vibeLine =
    vibe === "punchy"
      ? "Tone: a little personality, still safe for a real repo. No memes, no emoji."
      : vibe === "dry"
        ? "Tone: as short as possible. No filler."
        : "Tone: clear, professional, imperative mood.";
  const langLine = locale === "zh"
    ? "Language: Write the PR subject, summary, changes, and testPlan in Chinese (简体中文)."
    : "Language: Write in English.";
  return `You write GitHub pull request titles and bodies from a git diff.
Return JSON only, no markdown fences:
{"title":"type(scope): subject","summary":"...","changes":["..."],"testPlan":["..."]}
Title: conventional commits, lowercase subject, no trailing period, <= 72 chars.
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
Summary: 1-2 sentences. Changes: short file-level bullets. Test plan: 1-3 concrete checks.
${vibeLine}
${langLine}`;
}

function userPrompt(context: AiContext): string {
  const files = context.diff.files
    .map((file) => {
      const rename = file.fromPath ? ` (from ${file.fromPath})` : "";
      return `${file.status} ${file.path}${rename}  +${file.additions} -${file.deletions}`;
    })
    .join("\n");
  const hints = [
    context.type ? `Forced type: ${context.type}` : null,
    context.scope ? `Forced scope: ${context.scope}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const raw = context.diff.raw.slice(0, MAX_DIFF_CHARS);
  return [
    hints,
    "Changed files:",
    files,
    "",
    "Diff:",
    raw || "(binary or empty hunks)",
  ]
    .filter(Boolean)
    .join("\n");
}
