import type { HtmlTheme, InspectedDiff, Locale, ProposedPr, Vibe } from "./types.ts";
import { DEFAULT_HTML_THEME } from "./types.ts";

export { DEFAULT_HTML_THEME, HTML_THEMES, isHtmlTheme } from "./types.ts";
export type { HtmlTheme } from "./types.ts";

/** Escape text for safe insertion into HTML text/attr contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface HtmlFormatOptions {
  vibe?: Vibe;
  /** HTML palette only; default `ember` (= 0.1.17 look). */
  theme?: HtmlTheme;
}

/** CSS custom properties for each HTML palette. `ember` matches 0.1.17 exactly. */
export const THEME_TOKENS: Record<HtmlTheme, Record<string, string>> = {
  ember: {
    "--bg": "#1a1b26",
    "--bg-deep": "#16161e",
    "--panel": "#1f2335",
    "--border": "#3b4261",
    "--text": "#c0caf5",
    "--muted": "#565f89",
    "--blue": "#7aa2f7",
    "--cyan": "#7dcfff",
    "--green": "#9ece6a",
    "--orange": "#ff9e64",
    "--red": "#f7768e",
    "--yellow": "#e0af68",
    "--purple": "#bb9af7",
    "--font":
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
  fog: {
    "--bg": "#e8eef4",
    "--bg-deep": "#f7f9fc",
    "--panel": "#dce4ee",
    "--border": "#b4c0d0",
    "--text": "#243044",
    "--muted": "#6b7a8d",
    "--blue": "#3d6cb3",
    "--cyan": "#2a8a9a",
    "--green": "#3d8a5a",
    "--orange": "#c46a2d",
    "--red": "#c0455a",
    "--yellow": "#a07a20",
    "--purple": "#6b5a9a",
    "--font":
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    "--text-soft": "#4a5a6e",
    "--hot-border": "#e0b4bc",
    "--ok-border": "#b4d4be",
    "--mid-border": "#d4c8a0",
  },
  midnight: {
    "--bg": "#0b0d14",
    "--bg-deep": "#07080c",
    "--panel": "#12141c",
    "--border": "#2a3040",
    "--text": "#d4dce8",
    "--muted": "#6a7388",
    "--blue": "#6ea8ff",
    "--cyan": "#5eead4",
    "--green": "#4ade80",
    "--orange": "#fb923c",
    "--red": "#fb7185",
    "--yellow": "#fbbf24",
    "--purple": "#c084fc",
    "--font":
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    "--text-soft": "#9aa8bc",
    "--hot-border": "#4a1a24",
    "--ok-border": "#1a3a28",
    "--mid-border": "#3a3020",
  },
  paper: {
    "--bg": "#f6f0e4",
    "--bg-deep": "#fffaf0",
    "--panel": "#efe6d4",
    "--border": "#d4c4a8",
    "--text": "#3a2f22",
    "--muted": "#8a7a64",
    "--blue": "#3d6a8a",
    "--cyan": "#2d7a7a",
    "--green": "#4a7a40",
    "--orange": "#c46a28",
    "--red": "#b04040",
    "--yellow": "#a07820",
    "--purple": "#7a4a7a",
    "--font":
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    "--text-soft": "#5a4e3c",
    "--hot-border": "#e0b8b0",
    "--ok-border": "#c0d4b0",
    "--mid-border": "#dcc8a0",
  },
};

function themeRootCss(theme: HtmlTheme): string {
  const tokens = THEME_TOKENS[theme];
  const lines = Object.entries(tokens).map(
    ([key, value]) => `  ${key}: ${value};`,
  );
  return `:root {\n${lines.join("\n")}\n}`;
}

/** Remap leftover 0.1.17 hex literals so non-ember palettes stay readable. */
const THEME_OVERRIDES = `
.chip.hot { border-color: var(--hot-border); }
.summary, .body { color: var(--text-soft); }
.bullets { color: var(--text-soft); }
`;

const PAGE_CSS = `* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--text);
  font: 14px/1.55 var(--font);
}
body { padding: 28px 20px 56px; max-width: 880px; margin: 0 auto; }
.top {
  border: 1px solid var(--border); background: var(--panel);
  padding: 18px 20px; margin-bottom: 16px;
}
.top h1 { margin: 0 0 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.03em; }
.top .meta { color: var(--muted); font-size: 12px; }
.hero {
  border: 1px solid var(--border); background: var(--bg-deep);
  padding: 22px 20px; margin-bottom: 16px;
}
.hero .kicker {
  color: var(--muted); font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.1em; margin: 0 0 8px;
}
.hero .title {
  margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
  line-height: 1.25; color: var(--blue);
}
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.chip {
  padding: 1px 8px; border: 1px solid var(--border); font-size: 12px; color: var(--cyan);
}
.chip.hot { color: var(--red); border-color: #5a1d1d; }
.stats {
  color: var(--muted); font-size: 12px; margin-top: 12px;
}
.stats .add { color: var(--green); }
.stats .del { color: var(--red); }
.panel {
  border: 1px solid var(--border); background: var(--panel);
  padding: 16px 18px; margin: 0 0 14px;
}
h2 {
  font-size: 11px; color: var(--muted); text-transform: uppercase;
  letter-spacing: 0.1em; margin: 0 0 10px; font-weight: 600;
}
.summary, .body {
  margin: 0; color: #a9b1d6; white-space: pre-wrap;
}
.bullets { margin: 0; padding-left: 1.2em; color: #a9b1d6; }
.bullets li { margin: 0 0 4px; }
.empty { color: var(--muted); margin: 0; }
.files { width: 100%; border-collapse: collapse; }
.files td { padding: 4px 8px 4px 0; vertical-align: top; }
.files .status { color: var(--purple); width: 2ch; }
.files .path { color: var(--text); }
.files .add { color: var(--green); text-align: right; white-space: nowrap; }
.files .del { color: var(--red); text-align: right; white-space: nowrap; }
footer {
  margin-top: 24px; color: var(--muted); font-size: 11px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
@media (max-width: 640px) {
  .hero .title { font-size: 18px; }
}`;

const LABELS = {
  en: {
    proposed: "Proposed",
    summary: "Summary",
    changes: "Changes",
    testPlan: "Test plan",
    files: "Files",
    vs: "vs",
    breaking: "breaking",
    noChanges: "No change bullets.",
    noTests: "No test-plan bullets.",
    footer: "diff-vibe · self-contained · offline (file://)",
  },
  zh: {
    proposed: "提案",
    summary: "摘要",
    changes: "变更",
    testPlan: "测试计划",
    files: "文件",
    vs: "对比",
    breaking: "破坏性",
    noChanges: "无变更条目。",
    noTests: "无测试计划条目。",
    footer: "diff-vibe · 自包含 · 离线 (file://)",
  },
} as const;

function labelsFor(locale: Locale): (typeof LABELS)[Locale] {
  return LABELS[locale] ?? LABELS.en;
}

function totalsOf(inspected: InspectedDiff): { add: number; del: number } {
  return inspected.diff.files.reduce(
    (acc, file) => {
      acc.add += file.additions;
      acc.del += file.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );
}

function listHtml(items: string[], empty: string): string {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const rows = items
    .map((item) => `<li>${escapeHtml(item.replace(/^[-*]\s+/, ""))}</li>`)
    .join("\n");
  return `<ul class="bullets">\n${rows}\n</ul>`;
}

function filesHtml(inspected: InspectedDiff): string {
  const files = inspected.diff.files;
  if (files.length === 0) {
    return `<p class="empty">—</p>`;
  }
  const rows = files
    .slice(0, 24)
    .map((file) => {
      const name = file.fromPath && file.fromPath !== file.path
        ? `${file.fromPath} → ${file.path}`
        : file.path;
      return `<tr>
  <td class="status">${escapeHtml(file.status)}</td>
  <td class="path">${escapeHtml(name)}</td>
  <td class="add">+${file.additions}</td>
  <td class="del">−${file.deletions}</td>
</tr>`;
    })
    .join("\n");
  const more =
    files.length > 24
      ? `<p class="empty">… ${files.length - 24} more</p>`
      : "";
  return `<table class="files"><tbody>\n${rows}\n</tbody></table>${more}`;
}

/**
 * Self-contained PR-proposal HTML report (inline CSS, no CDN, no external fonts/scripts).
 * Safe for untrusted title/body/summary: all content fields are HTML-escaped.
 */
export function formatHtml(
  inspected: InspectedDiff,
  proposal: ProposedPr,
  options: HtmlFormatOptions = {},
): string {
  const locale = proposal.locale ?? "en";
  const strings = labelsFor(locale);
  const vibe = options.vibe ?? "calm";
  const theme = options.theme ?? DEFAULT_HTML_THEME;
  const themeOverrides = theme === "ember" ? "" : THEME_OVERRIDES;
  const totals = totalsOf(inspected);
  const fileLabel = inspected.diff.files.length === 1 ? "file" : "files";
  const scope = proposal.scope ? `(${proposal.scope})` : "";
  const breaking = proposal.breaking
    ? `<span class="chip hot">${escapeHtml(strings.breaking)}</span>`
    : "";
  const title = `diff-vibe · ${proposal.title}`;
  const meta = [
    proposal.engine,
    vibe,
    locale,
    inspected.rangeLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
${themeRootCss(theme)}
${PAGE_CSS}
${themeOverrides}</style>
</head>
<body>
<header class="top">
  <h1>diff-vibe</h1>
  <div class="meta">${escapeHtml(meta)}</div>
</header>
<section class="hero">
  <p class="kicker">${escapeHtml(strings.proposed)}</p>
  <h1 class="title">${escapeHtml(proposal.title)}</h1>
  <div class="chips">
    <span class="chip">${escapeHtml(proposal.type)}${escapeHtml(scope)}</span>
    <span class="chip">${escapeHtml(proposal.engine)}</span>
    <span class="chip">${escapeHtml(vibe)}</span>
    ${breaking}
  </div>
  <div class="stats">${inspected.diff.files.length} ${escapeHtml(fileLabel)} · <span class="add">+${totals.add}</span> <span class="del">−${totals.del}</span> · ${escapeHtml(strings.vs)} ${escapeHtml(inspected.rangeLabel)}</div>
</section>
<section class="panel">
  <h2>${escapeHtml(strings.files)}</h2>
  ${filesHtml(inspected)}
</section>
<section class="panel">
  <h2>${escapeHtml(strings.summary)}</h2>
  <p class="summary">${escapeHtml(proposal.summary.trim() || "—")}</p>
</section>
<section class="panel">
  <h2>${escapeHtml(strings.changes)}</h2>
  ${listHtml(proposal.changes, strings.noChanges)}
</section>
<section class="panel">
  <h2>${escapeHtml(strings.testPlan)}</h2>
  ${listHtml(proposal.testPlan, strings.noTests)}
</section>
<section class="panel">
  <h2>Body</h2>
  <pre class="body">${escapeHtml(proposal.body)}</pre>
</section>
<footer>${escapeHtml(strings.footer)}</footer>
</body>
</html>
`;
}
