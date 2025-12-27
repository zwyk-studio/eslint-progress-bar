import { spawn } from "node:child_process";
import { globby } from "globby";
import { createProgressBar, shouldShowProgress } from "./progress.js";

export interface RunResult {
  exitCode: number;
  output: string;
  errorOutput: string;
}

export interface ParsedOptions {
  eslintOptions: import("eslint").ESLint.Options;
  maxWarnings: number | null;
  format: string;
  extensions: string[];
}

/**
 * Extracts file patterns from ESLint arguments.
 * @internal Exported for testing
 */
export function extractPatterns(args: string[]): string[] {
  const patterns: string[] = [];
  let skipNext = false;

  const optionsWithValues = new Set([
    "-c", "--config", "--env", "--ext", "-f", "--format",
    "--parser", "--parser-options", "--resolve-plugins-relative-to",
    "--rulesdir", "--plugin", "--rule", "-o", "--output-file",
    "--ignore-path", "--max-warnings", "--cache-location", "--cache-strategy",
  ]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (skipNext) { skipNext = false; continue; }
    if (arg.startsWith("-")) {
      if (optionsWithValues.has(arg)) skipNext = true;
      continue;
    }
    patterns.push(arg);
  }

  return patterns.length > 0 ? patterns : ["."];
}

/**
 * Gets files to lint using globby.
 */
async function getFilesToLint(patterns: string[], extensions: string[]): Promise<string[]> {
  const globPatterns = patterns.flatMap((pattern) => {
    if (pattern.includes("*") || extensions.some((ext) => pattern.endsWith(ext))) {
      return [pattern];
    }
    return extensions.map((ext) => `${pattern}/**/*${ext}`);
  });

  try {
    return await globby(globPatterns, {
      gitignore: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      absolute: true,
    });
  } catch {
    return [];
  }
}

/**
 * Dynamically imports ESLint.
 */
async function loadESLint(): Promise<typeof import("eslint") | null> {
  try {
    return await import("eslint");
  } catch {
    return null;
  }
}

const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];

// Supported options (flags and options with values)
const SUPPORTED_FLAGS = new Set([
  "--fix", "--fix-dry-run", "--cache", "--no-cache",
  "--no-error-on-unmatched-pattern",
]);

const SUPPORTED_OPTIONS_WITH_VALUES = new Set([
  "-c", "--config", "--cache-location", "--cache-strategy",
  "--max-warnings", "-f", "--format", "--ext", "--rule",
]);

/**
 * Finds unsupported options in args.
 * @internal Exported for testing
 */
export function findUnsupportedOptions(args: string[]): string[] {
  const unsupported: string[] = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (!arg.startsWith("-")) continue;

    // Handle --option=value format
    const optionName = arg.includes("=") ? arg.split("=")[0] : arg;

    if (SUPPORTED_FLAGS.has(optionName)) continue;

    if (SUPPORTED_OPTIONS_WITH_VALUES.has(optionName)) {
      if (!arg.includes("=")) skipNext = true;
      continue;
    }

    // Unknown option
    unsupported.push(optionName);

    // Skip value if it looks like an option with value (doesn't start with -)
    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
      skipNext = true;
    }
  }

  return unsupported;
}

/**
 * Parses a --rule argument value into a rule config.
 * Supports: "rule:2", "rule:error", "rule:[2, options]"
 */
function parseRuleValue(value: string): { name: string; config: unknown } | null {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return null;

  const name = value.slice(0, colonIndex);
  const configStr = value.slice(colonIndex + 1);

  // Try to parse as JSON array first (e.g., "[2, { \"option\": true }]")
  if (configStr.startsWith("[")) {
    try {
      return { name, config: JSON.parse(configStr) };
    } catch {
      return { name, config: configStr };
    }
  }

  // Map string severity to number
  const severityMap: Record<string, number> = { off: 0, warn: 1, error: 2 };
  const severity = severityMap[configStr] ?? parseInt(configStr, 10);

  return { name, config: isNaN(severity) ? configStr : severity };
}

/**
 * Parses ESLint options from args.
 * @internal Exported for testing
 */
export function parseESLintOptions(args: string[]): ParsedOptions {
  const eslintOptions: import("eslint").ESLint.Options = {};
  let maxWarnings: number | null = null;
  let format = "stylish";
  let extensions: string[] = [];
  const rules: Record<string, unknown> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--fix": eslintOptions.fix = true; break;
      case "--fix-dry-run": eslintOptions.fix = true; break;
      case "-c": case "--config": eslintOptions.overrideConfigFile = args[++i]; break;
      case "--cache": eslintOptions.cache = true; break;
      case "--no-cache": eslintOptions.cache = false; break;
      case "--cache-location": eslintOptions.cacheLocation = args[++i]; break;
      case "--cache-strategy": eslintOptions.cacheStrategy = args[++i] as "content" | "metadata"; break;
      case "--no-error-on-unmatched-pattern": eslintOptions.errorOnUnmatchedPattern = false; break;
      // New options
      case "--max-warnings": maxWarnings = parseInt(args[++i], 10); break;
      case "-f": case "--format": format = args[++i]; break;
      case "--ext": {
        const extArg = args[++i];
        extensions = extArg.split(",").map((e) => e.startsWith(".") ? e : `.${e}`);
        break;
      }
      case "--rule": {
        const parsed = parseRuleValue(args[++i]);
        if (parsed) rules[parsed.name] = parsed.config;
        break;
      }
    }
  }

  // Apply rules if any were specified
  if (Object.keys(rules).length > 0) {
    eslintOptions.overrideConfig = { rules } as import("eslint").Linter.Config;
  }

  return {
    eslintOptions,
    maxWarnings,
    format,
    extensions: extensions.length > 0 ? extensions : DEFAULT_EXTENSIONS,
  };
}

// Batch size - balance between progress updates and performance
const BATCH_SIZE = 20;

/**
 * Runs ESLint using the API with progress bar.
 */
async function runWithAPI(args: string[]): Promise<RunResult | null> {
  const eslintModule = await loadESLint();
  if (!eslintModule) return null;

  const { ESLint } = eslintModule;

  try {
    const { eslintOptions, maxWarnings, format, extensions } = parseESLintOptions(args);
    const eslint = new ESLint(eslintOptions);
    const patterns = extractPatterns(args);

    // Show discovering message
    const showProgress = shouldShowProgress();
    if (showProgress) {
      process.stderr.write("Discovering files...\r");
    }

    // Get files and filter ignored ones
    const candidateFiles = await getFilesToLint(patterns, extensions);
    const files: string[] = [];
    for (const file of candidateFiles) {
      if (!(await eslint.isPathIgnored(file))) {
        files.push(file);
      }
    }

    // Clear the discovering message
    if (showProgress) {
      process.stderr.write("                    \r");
    }

    const totalFiles = files.length;
    if (totalFiles === 0) {
      // Let ESLint handle empty case
      const results = await eslint.lintFiles(patterns);
      const formatter = await eslint.loadFormatter(format);
      const output = await formatter.format(results);
      const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
      const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);
      return {
        exitCode: calculateExitCode(errorCount, warningCount, maxWarnings),
        output,
        errorOutput: "",
      };
    }

    const progressBar = createProgressBar();
    progressBar.start(totalFiles);

    const startTime = Date.now();
    const allResults: import("eslint").ESLint.LintResult[] = [];

    // Lint in batches
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await eslint.lintFiles(batch);
      allResults.push(...results);
      progressBar.increment(batch.length);
    }

    progressBar.stop();

    // Show total time (only in TTY)
    if (showProgress) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stderr.write(`\x1b[35mLinted ${totalFiles} files in ${duration}s\x1b[0m\n`);
    }

    // Apply fixes
    if (eslintOptions.fix) {
      await ESLint.outputFixes(allResults);
    }

    // Format output
    const formatter = await eslint.loadFormatter(format);
    const output = await formatter.format(allResults);

    const errorCount = allResults.reduce((sum, r) => sum + r.errorCount, 0);
    const warningCount = allResults.reduce((sum, r) => sum + r.warningCount, 0);
    return {
      exitCode: calculateExitCode(errorCount, warningCount, maxWarnings),
      output,
      errorOutput: "",
    };
  } catch (error) {
    // Log error in debug mode for troubleshooting
    if (process.env.DEBUG) {
      console.error("[eslint-progress-bar] ESLint API error:", error);
    }
    return null;
  }
}

/**
 * Calculates exit code based on errors, warnings, and max-warnings threshold.
 */
function calculateExitCode(errorCount: number, warningCount: number, maxWarnings: number | null): number {
  if (errorCount > 0) return 1;
  if (maxWarnings !== null && warningCount > maxWarnings) return 1;
  return 0;
}

/**
 * Fallback: spawn ESLint directly via npx.
 */
async function runWithSpawn(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    // Use npx to find eslint (works with local and global installs)
    const child = spawn("npx", ["eslint", ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, output: stdout, errorOutput: stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, output: "", errorOutput: `Failed to spawn: ${err.message}` });
    });
  });
}

/**
 * Main entry point.
 */
export async function runESLint(args: string[]): Promise<number> {
  // Check for unsupported options
  const unsupported = findUnsupportedOptions(args);
  if (unsupported.length > 0) {
    const optsList = unsupported.join(", ");
    process.stderr.write(
      `\x1b[33m⚠ Unsupported option${unsupported.length > 1 ? "s" : ""}: ${optsList}\n` +
      `  Running ESLint directly (no progress bar)\x1b[0m\n\n`
    );
    const spawnResult = await runWithSpawn(args);
    if (spawnResult.output) process.stdout.write(spawnResult.output);
    if (spawnResult.errorOutput) process.stderr.write(spawnResult.errorOutput);
    return spawnResult.exitCode;
  }

  // Try API mode (progress bar only shows in TTY)
  const result = await runWithAPI(args);
  if (result) {
    if (result.output) process.stdout.write(result.output);
    if (result.errorOutput) process.stderr.write(result.errorOutput);
    return result.exitCode;
  }

  // Fallback to spawn (only if API fails)
  const spawnResult = await runWithSpawn(args);
  if (spawnResult.output) process.stdout.write(spawnResult.output);
  if (spawnResult.errorOutput) process.stderr.write(spawnResult.errorOutput);
  return spawnResult.exitCode;
}
