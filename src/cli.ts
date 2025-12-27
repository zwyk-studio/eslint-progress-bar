import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runESLint } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
const VERSION = pkg.version;

function printUsage(): void {
  console.log(`
eslint-progress-bar - ESLint wrapper with progress bar

Usage:
  eslint-progress-bar [eslint-args...]

Examples:
  eslint-progress-bar .
  eslint-progress-bar src --fix
  eslint-progress-bar . --cache --max-warnings 0

In package.json:
  {
    "scripts": {
      "lint": "eslint-progress-bar .",
      "lint:fix": "eslint-progress-bar . --fix"
    }
  }

Behavior:
  - In local TTY: Shows a progress bar during linting
  - In CI or non-TTY: Runs ESLint transparently (no progress bar)
  - All arguments are forwarded to ESLint as-is
  - Exit code matches ESLint's exit code
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`eslint-progress-bar v${VERSION}`);
    process.exit(0);
  }

  // If no args, show help
  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  try {
    const exitCode = await runESLint(args);
    process.exit(exitCode);
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

main();
