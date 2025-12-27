import { describe, it, expect } from "vitest";
import { extractPatterns, parseESLintOptions, findUnsupportedOptions, type ParsedOptions } from "../runner.js";

const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];

describe("extractPatterns", () => {
  it("extracts simple patterns", () => {
    expect(extractPatterns(["src"])).toEqual(["src"]);
    expect(extractPatterns(["src", "lib"])).toEqual(["src", "lib"]);
    expect(extractPatterns(["."])).toEqual(["."]);
  });

  it("returns ['.'] when no patterns provided", () => {
    expect(extractPatterns([])).toEqual(["."]);
    expect(extractPatterns(["--fix"])).toEqual(["."]);
  });

  it("ignores flag options", () => {
    expect(extractPatterns(["--fix", "src"])).toEqual(["src"]);
    expect(extractPatterns(["src", "--fix"])).toEqual(["src"]);
    expect(extractPatterns(["--cache", "--fix", "src"])).toEqual(["src"]);
  });

  it("skips options with values", () => {
    expect(extractPatterns(["-c", "config.js", "src"])).toEqual(["src"]);
    expect(extractPatterns(["--config", "config.js", "src"])).toEqual(["src"]);
    expect(extractPatterns(["src", "-f", "json"])).toEqual(["src"]);
    expect(extractPatterns(["--format", "stylish", "src", "lib"])).toEqual(["src", "lib"]);
  });

  it("handles --max-warnings correctly", () => {
    expect(extractPatterns(["src", "--max-warnings", "0"])).toEqual(["src"]);
    expect(extractPatterns(["--max-warnings", "10", "src"])).toEqual(["src"]);
  });

  it("handles complex argument combinations", () => {
    expect(extractPatterns([
      "--fix",
      "-c", "eslint.config.js",
      "--max-warnings", "0",
      "src",
      "lib",
      "--cache"
    ])).toEqual(["src", "lib"]);
  });

  it("handles glob patterns", () => {
    expect(extractPatterns(["src/**/*.ts"])).toEqual(["src/**/*.ts"]);
    expect(extractPatterns(["*.js", "src/**/*.ts"])).toEqual(["*.js", "src/**/*.ts"]);
  });
});

describe("parseESLintOptions", () => {
  const defaultResult = {
    eslintOptions: {},
    maxWarnings: null,
    format: "stylish",
    extensions: DEFAULT_EXTENSIONS,
  };

  it("returns default options for empty args", () => {
    expect(parseESLintOptions([])).toEqual(defaultResult);
  });

  it("parses --fix", () => {
    expect(parseESLintOptions(["--fix"]).eslintOptions).toEqual({ fix: true });
    expect(parseESLintOptions(["src", "--fix"]).eslintOptions).toEqual({ fix: true });
  });

  it("parses --fix-dry-run", () => {
    expect(parseESLintOptions(["--fix-dry-run"]).eslintOptions).toEqual({ fix: true });
  });

  it("parses --cache options", () => {
    expect(parseESLintOptions(["--cache"]).eslintOptions).toEqual({ cache: true });
    expect(parseESLintOptions(["--no-cache"]).eslintOptions).toEqual({ cache: false });
  });

  it("parses --cache-location", () => {
    expect(parseESLintOptions(["--cache-location", ".eslintcache"]).eslintOptions).toEqual({
      cacheLocation: ".eslintcache",
    });
  });

  it("parses --cache-strategy", () => {
    expect(parseESLintOptions(["--cache-strategy", "content"]).eslintOptions).toEqual({
      cacheStrategy: "content",
    });
    expect(parseESLintOptions(["--cache-strategy", "metadata"]).eslintOptions).toEqual({
      cacheStrategy: "metadata",
    });
  });

  it("parses -c/--config", () => {
    expect(parseESLintOptions(["-c", "custom.config.js"]).eslintOptions).toEqual({
      overrideConfigFile: "custom.config.js",
    });
    expect(parseESLintOptions(["--config", "eslint.config.mjs"]).eslintOptions).toEqual({
      overrideConfigFile: "eslint.config.mjs",
    });
  });

  it("parses --no-error-on-unmatched-pattern", () => {
    expect(parseESLintOptions(["--no-error-on-unmatched-pattern"]).eslintOptions).toEqual({
      errorOnUnmatchedPattern: false,
    });
  });

  it("parses multiple options", () => {
    expect(parseESLintOptions([
      "--fix",
      "--cache",
      "--cache-location", "/tmp/eslint",
      "-c", "my.config.js"
    ]).eslintOptions).toEqual({
      fix: true,
      cache: true,
      cacheLocation: "/tmp/eslint",
      overrideConfigFile: "my.config.js",
    });
  });

  it("ignores unknown options", () => {
    expect(parseESLintOptions(["--unknown-flag", "src"]).eslintOptions).toEqual({});
  });

  it("ignores patterns (non-options)", () => {
    expect(parseESLintOptions(["src", "lib", "--fix"]).eslintOptions).toEqual({ fix: true });
  });

  // New options tests
  it("parses --max-warnings", () => {
    expect(parseESLintOptions(["--max-warnings", "10"]).maxWarnings).toBe(10);
    expect(parseESLintOptions(["--max-warnings", "0"]).maxWarnings).toBe(0);
  });

  it("parses -f/--format", () => {
    expect(parseESLintOptions(["-f", "json"]).format).toBe("json");
    expect(parseESLintOptions(["--format", "compact"]).format).toBe("compact");
  });

  it("parses --ext", () => {
    expect(parseESLintOptions(["--ext", ".ts,.tsx"]).extensions).toEqual([".ts", ".tsx"]);
    expect(parseESLintOptions(["--ext", "js,jsx"]).extensions).toEqual([".js", ".jsx"]);
  });

  it("parses --rule with severity number", () => {
    const result = parseESLintOptions(["--rule", "no-console:2"]);
    expect(result.eslintOptions.overrideConfig).toEqual({ rules: { "no-console": 2 } });
  });

  it("parses --rule with severity name", () => {
    const result = parseESLintOptions(["--rule", "no-debugger:error"]);
    expect(result.eslintOptions.overrideConfig).toEqual({ rules: { "no-debugger": 2 } });
  });

  it("parses --rule with JSON config", () => {
    const result = parseESLintOptions(["--rule", 'quotes:[2, "single"]']);
    expect(result.eslintOptions.overrideConfig).toEqual({ rules: { quotes: [2, "single"] } });
  });

  it("parses multiple --rule options", () => {
    const result = parseESLintOptions(["--rule", "no-console:warn", "--rule", "no-debugger:error"]);
    expect(result.eslintOptions.overrideConfig).toEqual({
      rules: { "no-console": 1, "no-debugger": 2 },
    });
  });
});

describe("findUnsupportedOptions", () => {
  it("returns empty array for supported options", () => {
    expect(findUnsupportedOptions(["--fix", "src"])).toEqual([]);
    expect(findUnsupportedOptions(["--cache", "--max-warnings", "0"])).toEqual([]);
    expect(findUnsupportedOptions(["-f", "json", "-c", "config.js"])).toEqual([]);
  });

  it("detects unsupported flags", () => {
    expect(findUnsupportedOptions(["--quiet"])).toEqual(["--quiet"]);
    expect(findUnsupportedOptions(["--debug"])).toEqual(["--debug"]);
  });

  it("detects unsupported options with values", () => {
    expect(findUnsupportedOptions(["--parser", "babel"])).toEqual(["--parser"]);
    expect(findUnsupportedOptions(["--ignore-path", ".gitignore"])).toEqual(["--ignore-path"]);
  });

  it("detects multiple unsupported options", () => {
    expect(findUnsupportedOptions(["--quiet", "--debug", "src"])).toEqual(["--quiet", "--debug"]);
  });

  it("handles mixed supported and unsupported options", () => {
    expect(findUnsupportedOptions(["--fix", "--quiet", "--cache"])).toEqual(["--quiet"]);
  });

  it("handles --option=value format", () => {
    expect(findUnsupportedOptions(["--parser=babel"])).toEqual(["--parser"]);
    expect(findUnsupportedOptions(["--config=eslint.config.js"])).toEqual([]);
  });

  it("ignores non-option arguments", () => {
    expect(findUnsupportedOptions(["src", "lib", "*.ts"])).toEqual([]);
  });
});
