import cliProgress from "cli-progress";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Should we show the progress bar?
 * Only in TTY mode and not in CI.
 */
export function shouldShowProgress(): boolean {
  if (!process.stderr.isTTY) return false;

  const ciVars = [
    "CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS",
    "TRAVIS", "CIRCLECI", "GITLAB_CI", "JENKINS_URL",
    "BUILDKITE", "TF_BUILD",
  ];

  return !ciVars.some((v) => process.env[v]);
}

export interface ProgressBarConfig {
  format?: string;
  barCompleteChar?: string;
  barIncompleteChar?: string;
  barSize?: number;
}

/**
 * Loads config from package.json "eslint-progress-bar" key.
 */
function loadConfig(): ProgressBarConfig {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg["eslint-progress-bar"] || {};
  } catch {
    return {};
  }
}

export interface ProgressBar {
  start(total: number): void;
  increment(count?: number): void;
  stop(): void;
}

/**
 * Creates a progress bar for linting.
 */
export function createProgressBar(): ProgressBar {
  if (!shouldShowProgress()) {
    return { start: () => {}, increment: () => {}, stop: () => {} };
  }

  const config = loadConfig();

  const bar = new cliProgress.SingleBar(
    {
      format: config.format || "Linting |{bar}| {percentage}% ({value}/{total})",
      barCompleteChar: config.barCompleteChar || "\u2588",
      barIncompleteChar: config.barIncompleteChar || "-",
      barsize: config.barSize,
      hideCursor: true,
      clearOnComplete: true,
      stream: process.stderr,
    },
    cliProgress.Presets.shades_classic
  );

  let started = false;

  return {
    start(total: number) {
      if (total > 0) {
        bar.start(total, 0);
        started = true;
      }
    },
    increment(count = 1) {
      if (started) bar.increment(count);
    },
    stop() {
      if (started) {
        bar.stop();
        started = false;
      }
    },
  };
}
