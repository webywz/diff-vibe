import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  helpText,
  parseArgs,
  parseLocale,
  UsageError,
} from "../src/parse-args.ts";

describe("parseArgs", () => {
  it("defaults to calm vibe, en locale, and full output", () => {
    const options = parseArgs([], {});
    assert.equal(options.vibe, "calm");
    assert.equal(options.locale, "en");
    assert.equal(options.titleOnly, false);
    assert.equal(options.bodyOnly, false);
    assert.equal(options.json, false);
    assert.equal(options.github, false);
    assert.equal(options.quiet, false);
    assert.equal(options.maxAnnotations, 20);
    assert.equal(options.copy, false);
    assert.equal(options.open, false);
    assert.equal(options.create, false);
    assert.equal(options.update, false);
    assert.equal(options.draft, false);
    assert.equal(options.noAi, false);
    assert.equal(options.noColor, false);
    assert.equal(options.base, undefined);
    assert.equal(options.theme, "ember");
    assert.equal(options.html, undefined);
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

  it("parses --locale flag", () => {
    assert.equal(parseArgs(["--locale", "zh"], {}).locale, "zh");
    assert.equal(parseArgs(["--locale=en"], {}).locale, "en");
  });

  it("reads locale from env when flag is omitted", () => {
    assert.equal(parseArgs([], { VIBE_LOCALE: "zh" }).locale, "zh");
    assert.equal(parseArgs([], { DIFF_VIBE_LOCALE: "zh" }).locale, "zh");
    assert.equal(parseArgs([], { DIFF_VIBE_LOCALE: "zh", VIBE_LOCALE: "en" }).locale, "zh");
  });

  it("CLI flag overrides env locale", () => {
    assert.equal(parseArgs(["--locale", "en"], { VIBE_LOCALE: "zh" }).locale, "en");
    assert.equal(parseArgs(["--locale", "zh"], { DIFF_VIBE_LOCALE: "en" }).locale, "zh");
  });

  it("rejects unknown flags, bad vibes, bad locales, and mixed output flags", () => {
    assert.throws(() => parseArgs(["--wat"], {}), UsageError);
    assert.throws(() => parseArgs(["--vibe", "chaotic"], {}), UsageError);
    assert.throws(() => parseArgs(["--locale", "fr"], {}), UsageError);
    assert.throws(() => parseArgs(["--locale"], {}), UsageError);
    assert.throws(() => parseArgs(["extra"], {}), UsageError);
    assert.throws(
      () => parseArgs(["--title-only", "--body-only"], {}),
      UsageError,
    );
    assert.throws(() => parseArgs(["--draft"], {}), UsageError);
  });

  it("parses --out flag", () => {
    const withSpace = parseArgs(["--out", "report.md"], {});
    assert.equal(withSpace.out, "report.md");

    const withEquals = parseArgs(["--out=output.json"], {});
    assert.equal(withEquals.out, "output.json");
  });

  it("rejects --out without value", () => {
    assert.throws(() => parseArgs(["--out"], {}), UsageError);
    assert.throws(() => parseArgs(["--out="], {}), UsageError);
  });

  it("allows --out with --suite", () => {
    const options = parseArgs(["--suite", "diffs/", "--out", "report.json"], {});
    assert.equal(options.suite, "diffs/");
    assert.equal(options.out, "report.json");
  });
});

describe("parseArgs --html", () => {
  it("parses --html as stdout or optional path", () => {
    assert.equal(parseArgs(["--html"], {}).html, true);
    assert.equal(parseArgs(["--html", "--quiet"], {}).html, true);
    assert.equal(parseArgs(["--html", "report.html"], {}).html, "report.html");
    assert.equal(parseArgs(["--html=report.html"], {}).html, "report.html");
    assert.equal(parseArgs(["--html="], {}).html, true);
  });

  it("rejects --html with --json or --suite", () => {
    assert.throws(
      () => parseArgs(["--html", "--json"], {}),
      /cannot be combined with --json/,
    );
    assert.throws(
      () => parseArgs(["--html", "out.html", "--json"], {}),
      /cannot be combined with --json/,
    );
    assert.throws(
      () => parseArgs(["--suite", "diffs/", "--html"], {}),
      /cannot be combined with --suite/,
    );
  });

  it("documents --html in help", () => {
    const help = helpText();
    assert.match(help, /--html \[path\]/);
    assert.match(help, /Self-contained HTML report/);
    assert.match(help, /--html and --json cannot share stdout/);
  });
});

describe("parseArgs --theme", () => {
  it("defaults to ember", () => {
    assert.equal(parseArgs([], {}).theme, "ember");
    assert.equal(parseArgs(["--html"], {}).theme, "ember");
  });

  it("parses space and equals forms", () => {
    assert.equal(parseArgs(["--theme", "fog"], {}).theme, "fog");
    assert.equal(parseArgs(["--theme=midnight"], {}).theme, "midnight");
    assert.equal(parseArgs(["--theme", "paper", "--html"], {}).theme, "paper");
    assert.equal(parseArgs(["--theme", "EMBER"], {}).theme, "ember");
  });

  it("rejects invalid and missing --theme", () => {
    assert.throws(
      () => parseArgs(["--theme", "solar"], {}),
      (error: unknown) =>
        error instanceof UsageError &&
        /Invalid --theme/.test(error.message) &&
        /ember, fog, midnight, paper/.test(error.message),
    );
    assert.throws(() => parseArgs(["--theme"], {}), UsageError);
    assert.throws(() => parseArgs(["--theme="], {}), UsageError);
    assert.throws(() => parseArgs(["--theme", ""], {}), UsageError);
  });

  it("allows --theme with --html, --github, --quiet, --locale", () => {
    const options = parseArgs(
      [
        "--html",
        "--theme",
        "fog",
        "--github",
        "--quiet",
        "--locale",
        "zh",
        "--no-ai",
      ],
      {},
    );
    assert.equal(options.html, true);
    assert.equal(options.theme, "fog");
    assert.equal(options.github, true);
    assert.equal(options.quiet, true);
    assert.equal(options.locale, "zh");
  });

  it("allows --theme with --suite (HTML-only; suite stays JSON)", () => {
    const options = parseArgs(["--suite", "diffs/", "--theme", "paper"], {});
    assert.equal(options.suite, "diffs/");
    assert.equal(options.theme, "paper");
    assert.equal(options.html, undefined);
  });

  it("still rejects --html together with --json when --theme is set", () => {
    assert.throws(
      () => parseArgs(["--html", "--theme", "fog", "--json"], {}),
      UsageError,
    );
  });

  it("documents --theme in help", () => {
    const help = helpText();
    assert.match(help, /--theme /);
    assert.match(help, /ember \(default\)/);
    assert.match(help, /fog/);
    assert.match(help, /midnight/);
    assert.match(help, /paper/);
    assert.match(help, /--theme only restyles --html/);
  });
});


describe("parseArgs github / quiet / max-annotations", () => {
  it("parses --github, --quiet, and --max-annotations", () => {
    const options = parseArgs(
      ["--github", "--quiet", "--max-annotations", "8"],
      {},
    );
    assert.equal(options.github, true);
    assert.equal(options.quiet, true);
    assert.equal(options.maxAnnotations, 8);
  });

  it("parses --max-annotations= equals form", () => {
    assert.equal(parseArgs(["--max-annotations=12"], {}).maxAnnotations, 12);
  });

  it("rejects invalid --max-annotations", () => {
    assert.throws(() => parseArgs(["--max-annotations", "0"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations", "-1"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations", "1.5"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations"], {}), UsageError);
    assert.throws(() => parseArgs(["--max-annotations="], {}), UsageError);
  });

  it("documents --github / --quiet / --max-annotations in help", () => {
    const help = helpText();
    assert.match(help, /--github/);
    assert.match(help, /--quiet/);
    assert.match(help, /--max-annotations/);
    assert.match(help, /抑制漂亮终端报告|Suppress the pretty/);
  });
});

describe("parseLocale", () => {
  it("parses valid locales", () => {
    assert.equal(parseLocale("en"), "en");
    assert.equal(parseLocale("zh"), "zh");
    assert.equal(parseLocale("EN"), "en");
    assert.equal(parseLocale("ZH"), "zh");
  });

  it("rejects invalid locales", () => {
    assert.throws(() => parseLocale("fr"), UsageError);
    assert.throws(() => parseLocale(""), UsageError);
    assert.throws(() => parseLocale(undefined), UsageError);
  });
});

describe("parseArgs --no-color", () => {
  it("parses --no-color flag", () => {
    const options = parseArgs(["--no-color"], {});
    assert.equal(options.noColor, true);
  });

  it("respects NO_COLOR environment variable", () => {
    const withNoColor = parseArgs([], { NO_COLOR: "1" });
    assert.equal(withNoColor.noColor, true);

    const withNoColorEmpty = parseArgs([], { NO_COLOR: "true" });
    assert.equal(withNoColorEmpty.noColor, true);
  });

  it("does not enable noColor when NO_COLOR is unset", () => {
    const options = parseArgs([], {});
    assert.equal(options.noColor, false);
  });

  it("--no-color flag overrides NO_COLOR environment variable", () => {
    const options = parseArgs(["--no-color"], { NO_COLOR: undefined });
    assert.equal(options.noColor, true);
  });

  it("combines with other flags", () => {
    const options = parseArgs(["--no-color", "--json", "--no-ai"], {});
    assert.equal(options.noColor, true);
    assert.equal(options.json, true);
    assert.equal(options.noAi, true);
  });
});
