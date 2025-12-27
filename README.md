# eslint-progress-bar

> Finally see what ESLint is doing.

You run `eslint .` and... nothing. Just a blinking cursor. For 30 seconds. Is it stuck? Working? No idea.

**eslint-progress-bar** fixes that:

```
Discovering files...
Linting |████████████████████-----| 78% (312/400)
Linted 400 files in 12.3s
```

## Install

Requires ESLint 8+ (you probably already have it).

```bash
npm install -D eslint-progress-bar
# or
yarn add -D eslint-progress-bar
# or
pnpm add -D eslint-progress-bar
# or
bun add -D eslint-progress-bar
```

## Use

Just replace `eslint` with `eslint-progress-bar`:

```diff
{
  "scripts": {
-   "lint": "eslint ."
+   "lint": "eslint-progress-bar ."
  }
}
```

## Options

```bash
eslint-progress-bar --help
eslint-progress-bar --version
```

Supported ESLint options: `--fix`, `--fix-dry-run`, `--cache`, `--no-cache`, `--cache-location`, `--cache-strategy`, `--config`, `--max-warnings`, `--format`, `--ext`, `--rule`, `--no-error-on-unmatched-pattern`.

Examples:

```bash
eslint-progress-bar . --fix
eslint-progress-bar src --cache --max-warnings 0
eslint-progress-bar . -f json > results.json
```

If you use an unsupported option, you'll see a warning and ESLint runs directly (no progress bar).

## CI-friendly

- **Local terminal**: Shows progress bar + timing
- **CI / non-TTY**: Silent, no extra output

Auto-detected. Zero config.

## Customize

Optional. Add to your `package.json`:

```json
{
  "eslint-progress-bar": {
    "format": "Linting [{bar}] {percentage}% | {value}/{total}",
    "barCompleteChar": "█",
    "barIncompleteChar": "░",
    "barSize": 30
  }
}
```

Uses [cli-progress](https://github.com/npkgz/cli-progress) format tokens.

## How it works

1. Finds files with globby
2. Filters with ESLint's ignore rules
3. Lints in batches of 20
4. Shows ESLint output at the end

Uses ESLint's Node.js API. Falls back to `npx eslint` if needed.

## Troubleshooting

If something goes wrong, enable debug mode to see ESLint API errors:

```bash
DEBUG=1 eslint-progress-bar .
```

## Requirements

- Node.js 18+
- ESLint 8+ or 9+

## License

MIT
