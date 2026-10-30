# Development and verification

```sh
bun install --frozen-lockfile
bun run dev
bun run format:check
bun run check
bun run build
bun --preload @opentui/solid/preload dist/index.js --demo
```

The bundle uses installed `node_modules` for native OpenTUI and other
dependencies; it is not a standalone binary. Source and test runtime both need
the Solid preload configured in `bunfig.toml`.

Tests exercise real stdio ACP connections, permission and question round trips,
cancellation, crash recovery, replay, terminal output, state/persistence, and
headless native UI keyboard/rendering behavior. They need no login or paid model
calls. CI targets Linux and macOS. See [`AGENTS.md`](../AGENTS.md) for the code
layout, architecture, and repository conventions.

## Formatting and commit hooks

Biome formats JavaScript/TypeScript (including TSX), JSON/JSONC, Markdown, and
YAML. Run `bun run format` to format the project or `bun run format:check` to
check without writing. CI enforces formatting on Linux and macOS. Dependencies,
generated `dist/` output, `bun.lock`, and Git-ignored files are excluded. The
pinned Biome version uses two-space indentation, double quotes, semicolons, and
a preferred line width of 100.

`bun install` installs the Husky pre-commit hook through `prepare`. The hook
runs lint-staged and Biome on whole staged files, automatically staging the
formatted result. lint-staged temporarily hides unstaged edits in partially
staged files and restores them afterward. Bun must be on the committing
process's `PATH`. Set `HUSKY=0` to skip hook installation/execution in CI.

Bulk formatting belongs in a dedicated `style:` commit containing only
formatter output. Record its full hash in `.git-blame-ignore-revs` in a later
commit, including after formatter upgrades that change output broadly. Enable
the shared ignore list for local blame once per checkout:

```sh
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub also uses this file in its blame view. Preserve these commits when
merging (avoid squash/rebase that changes the recorded hash), or update the
ignore list to the formatting commit's final hash afterward. Existing history
is not rewritten.

## Current scope

This version implements **stable ACP v1 over local stdio**, with one active
agent process. Remote transports, remote session discovery,
multi-agent/background sessions, image/audio input, terminal-auth handoff, Git
undo, longer key sequences, and standalone binary distribution are future work.
Available UI features depend on the agent's advertised capabilities.
