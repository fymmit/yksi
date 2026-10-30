# yksi — repository guide

## Purpose

yksi (Finnish for "one") is an agent-agnostic, keyboard-first terminal client for
AI coding agents using the **Agent Client Protocol (ACP)**. The desired UX follows OpenCode's interaction flow
(conversation, composer, palette, sessions, tool details and permissions), with
its own visual design. Copilot CLI is the first real integration. Agent behavior
belongs to the external ACP process; this application owns the user interface
and client-side filesystem/terminal services.

## Stack and commands

- Bun >= 1.4.1, TypeScript (strict), Solid 1.9, OpenTUI 0.8.
- Official `@agentclientprotocol/sdk` **stable v1 entry point**. The SDK package
  version is 2.x; that does not mean we implement draft ACP v2.
- Bun SQLite for local history and preferences; Zod for configuration; Ajv for
  agent-requested forms.

```sh
bun install --frozen-lockfile
bun run start                 # Copilot in the current project
bun run demo                  # offline ACP demonstration
bun run start -- /path/to/project --agent copilot
bun run format                # Biome formatting pass
bun run format:check          # read-only formatting check (also enforced in CI)
bun run check                 # strict type-check + tests
bun run build                 # Bun bundle in dist/ (native deps stay external)
```

`bunfig.toml` must preload `@opentui/solid/preload` for **both runtime and tests**.
Otherwise Bun runs Solid's server implementation / untransformed JSX. The bin
launcher installs this preload before dynamically importing the app so it works
from other directories. Bundles require the preload too (see docs/development.md).

## Layout

- `src/index.tsx`: CLI parsing, terminal lifecycle, application wiring.
- `src/config.ts`: validated global agent definitions, XDG paths, demo launch.
- `src/themes.ts`: renderer-independent theme schema, thirteen built-in palettes,
  custom preset overrides, and startup selection precedence.
- `src/keybindings.ts`: typed action/default/context registry, validated global
  overrides, exact key matching, and shortcut labels.
- `src/modes.ts`: semantic mode selection, preferring categorized config options
  over the legacy session modes API.
- `src/acp/client.ts`: SDK fluent client, stdio, capabilities, stderr and timeouts.
- `src/acp/files.ts`, `src/acp/terminals.ts`: ACP client resource methods.
- `src/controller.ts`: connection/session lifecycle, permission and question
  queues, cancellation, turn submission, replay, settings, throttled snapshots.
- `src/state.ts`: serializable conversation model and update reducer.
- `src/storage.ts`: SQLite persistence, workspace-scoped local history.
- `src/ui/`: Solid components, palette, composer, tool/diff rendering and themes.
  `timeline.tsx` renders left-aligned assistant and right-aligned user message cards;
  `message-time.ts` formats local message times, with full dates outside today.
  Reasoning, system notices and tools stay outside message cards. Old saved
  messages without a creation time remain readable without a timestamp.
  `status-bar.tsx` renders a single-line, width-aware session summary with a
  reserved help hint. `help.tsx` renders searchable floating keyboard help from
  the keybinding registry's descriptions and resolved alternatives.
  `usage.ts` formats reported session cost and the local `/tui:usage` summary.
  `theme.ts` maps resolved colors to native syntax/editor/scrollbar styles.
  `markdown.tsx` themes Markdown selection, tables and fenced backgrounds while
  preserving incremental prose rendering (OpenTUI 0.8's `codeBlockOnly` hook flag
  preserves coalescing; cover this compatibility behavior when upgrading).
  `form.tsx` and `form-state.ts` render and validate keyboard-driven elicitation
  forms, with checkbox multi-selects for finite-choice string arrays and JSON
  fallback for other arrays and unsupported widget types.
- `src/demo-agent.ts`: real stdio ACP demo; simulated edits, no model service.
- `tests/fixtures/agent.ts`: deterministic protocol fixture for lifecycle tests.
- `bin/yksi.ts`, `scripts/build.ts`: launcher and bundle build.

## Conventions and invariants

- Use Conventional Commit-style messages: a lowercase type and colon followed
  by a concise imperative subject (for example, `feat: add ...`). Add a
  descriptive body when useful.
- Keep protocol logic independent of Solid and renderables. Domain state is
  mutable within the controller, published as snapshots, and reconciled into a
  Solid store. Preserve timeline item IDs across streaming updates.
- Use typed SDK method constants / fluent `client()` and `agent()` APIs. Avoid
  deprecated connection classes and assumptions about vendor-private metadata.
- Advertise only implemented capabilities. Read models, modes and slash commands
  from agent responses/notifications. Command updates and plans are replacement
  snapshots; tool-call updates are sparse patches.
- Stable ACP `usage_update` is a replacement snapshot: cost is cumulative, never
  summed across notifications. Missing/null cost means not reported; zero is valid.
  Persist `usageUpdatedAt` as the local receipt time, including through buffered
  replay. Preserve saved usage on failed load or resume without a new reading;
  clear usage when creating a new remote session. Display agent-reported currency
  and cost without inferring subscription allowance or billing accuracy.
- Client slash commands use `/tui:`; advertised agent commands use `/name`.
  Unknown slash commands must not silently become model prompts.
- A local transcript is not a resumed agent session. Prefer advertised resume;
  otherwise load and replace history only after replay succeeds. Keep local
  history readable on failure. Never invent a remote session ID or automatically
  resend a prompt after disconnect.
- Only one active agent connection/turn is supported. Generation checks keep
  stale async operations from modifying a replacement session.
- Mode cycling uses the first `category: "mode"` config option and agent-provided
  choice order (flattening groups), or toggles a boolean mode. Legacy modes are
  used only without config options. Setting changes require an idle session,
  serialize requests, and discard stale results/errors after session replacement.
- Remember the last explicitly selected, agent-confirmed model in SQLite settings
  per configured agent (`model:<agent>`), across projects and restarts. Use the first
  select config option categorized as `model`, including grouped choices. Restore
  it only for new remote sessions, while still connecting; resumed/loaded sessions
  retain their remote model. Missing/rejected choices produce a notice without
  losing the preference or blocking a usable connection. Agent-initiated/dependent
  model updates and stale setting responses must not overwrite the preference.
- Resolve pending interaction promises on cancellation/disconnect. An agent's
  permission option IDs and scope labels are authoritative.
- ACP paths are absolute, line numbers 1-based. Filesystem and command execution
  use the launching user's privileges; honor the agent's permission flow.
- Agent stdout is reserved for NDJSON; capture stderr to the log. On shutdown,
  restore the terminal, close SQLite, and terminate owned process groups.
- UI state/settings are local. Do not automatically execute project-local agent
  configuration. The only configuration is the global file or explicit --config.
- Themes are startup-loaded global config: `theme` selects an explicit startup
  theme; `themes` defines named overrides extending a built-in preset. Validate
  names, references, token keys and #RRGGBB values. Resolve startup selection as
  explicit config, valid saved SQLite `theme`, then `dark`. Preserve existing
  dark/light settings. Picker changes apply immediately and persist, but explicit
  config wins again on restart. All UI, input/selection, scrollbar, Markdown,
  syntax and diff colors come from resolved tokens. Native syntax styles are
  allocated lazily per visited theme and destroyed on app cleanup.
- Keybindings are startup-loaded overrides in that configuration: omitted actions
  inherit defaults, arrays replace shortcuts, and `[]` disables them. Contexts
  permit key reuse only where actions cannot overlap. Keep handlers and hints
  sourced from `src/keybindings.ts`; inline hints use the first alternative and
  palette details show all alternatives. The global `leader` defaults to `ctrl+x`;
  symbolic `leader p` sequences resolve against it, while literal `ctrl+x p`
  sequences remain unchanged. Validate conflicts after leader expansion using
  the combined configuration. Two-key sequences
  use a context-scoped prefix: show a pending hint, consume the next key, cancel
  with Escape or a two-second timeout. Prefixes cannot also be single keys in
  the same context. Sequences are supported for centrally routed application
  commands; widgets and immediate global actions use single keys. Consume handled
  keys before other handlers/widgets; suppress managed OpenTUI editor defaults
  with `src/ui/keybindings.ts` so disabled/remapped keys cannot fall through.
  Ctrl+P/N mirror Up/Down, including visual composer movement before input history.
  Confirmation/submission/toggle actions ignore repeat events; navigation repeats.
  Help is a separate keyboard context. While open, keep underlying pickers/forms
  mounted but inactive so drafts, selection, and cursor position survive. Only
  help controls and global quit/interrupt handlers act; Escape closes help alone.
- Keep dependencies pinned via `bun.lock`; do not edit vendored dependencies.
- Biome is the pinned formatter for JS/TS/TSX, JSON/JSONC, Markdown, and YAML.
  Use `bun run format` / `bun run format:check`; linting and assist are disabled.
  `bun install` prepares Husky; its pre-commit hook runs lint-staged on whole
  staged files, preserving unstaged edits in partially staged files. Keep the
  file extensions in `biome.json` and `package.json`'s `lint-staged` entry aligned.
  Dependencies, `dist/`, `bun.lock`, and Git-ignored files are excluded.
  Keep bulk formatter output in a dedicated `style:` commit, then record its
  full hash in `.git-blame-ignore-revs` in a following commit. Preserve that hash
  when merging; local blame opts in with
  `git config --local blame.ignoreRevsFile .git-blame-ignore-revs`.
- Changes to protocol/state/lifecycle need meaningful tests. For UI behavior use
  `testRender`, real key events, and frame assertions; always dispose renderers.
  Markdown highlighting runs in a worker, so wait for a rendered predicate.
- Bun 1.4.4's `toMatchObject` with asymmetric matchers can mutate the actual object.
  Avoid applying these matchers directly to live domain state.

## Current status / boundaries

Implemented: stdio agents, streaming Markdown, tool cards/diffs, client file and
terminal services, permissions, form/URL elicitation, cancellation, local session
history and advertised resumption, file attachments, dynamic agent commands and
configuration, configurable keybindings, themes, sidebar, export and offline demo.
**Choose theme**, `/tui:theme`, and the default `ctrl+x t` (`app.theme`) open a
searchable picker for built-in and custom themes. Built-ins include Dark/Light,
Gruvbox Dark/Light, all four Catppuccin flavors, GitHub Dark/Light, Dracula, Nord,
and Tokyo Night. Theme switching preserves drafts, focus and timeline IDs;
Escape cancels the picker and help preserves its filter/selection.
The footer summarizes settings, context/cost, completed/total plan steps, and
reported-diff file count. At 100+ columns every displayed field has a label;
below 100 columns fields show values only, including legacy modes, except boolean
settings and toggle-like select values (On/Off, Yes/No, True/False, Enabled/Disabled,
case-insensitive) retain their labels (`Allow All: Off`), and file counts retain
their unit (`1 file` / `3 files`).
Truncate model values from the start and other setting values/labels from the end,
preserving graphemes and terminal-cell widths. Context, cost, plan progress, and
file counts stay whole or are omitted.
Footer display order is mode, model, thought_level (effort), context, cost, plan,
files, then other settings, with config IDs breaking ties. Space allocation still
prioritizes context/cost, then mode/model/effort, plan, files, and other settings.
Lower-priority fields are omitted at
narrow widths; a configurable help hint remains at the right. The sidebar remains
visible by default at 100+ columns, respecting the saved preference. F1 (`app.help`),
**Keyboard shortcuts**, and `/tui:help` open a searchable floating reference with
current-context shortcuts first, all configured alternatives, and unbound actions.
F1/Escape closes it with focus and drafts restored. Help scrolling uses
`help.previous`/`help.next` and `help.pageUp`/`help.pageDown`. General footer/sidebar
shortcut lists are replaced by help; contextual interaction hints remain.
Standard ACP context and cumulative session cost appear in the sidebar when
reported; **Show session usage** / `/tui:usage` shows a snapshot with local receipt
time, including on narrow terminals. `app.usage` is unbound by default.
Input history is per session and persists typed local commands, sent messages,
and attachment paths separately from the transcript. Up/Down browse at the first
and last visual composer lines; otherwise they move within multiline text.
Returning past the newest entry restores the unsent draft, and editing a recalled
entry does not change saved history. Older transcripts without explicit input
history fall back to their user messages. Drafts survive session switches within
the running TUI.
Shift+Tab (`app.cycle-mode`) cycles agent modes; **Cycle mode** / `/tui:cycle-mode`
provides the same action. The composer shows the confirmed mode and shortcut even
on narrow terminals. Key repeats and presses during a pending change are ignored.
`leader m` (`app.model`) opens the first agent-advertised select model option
directly; without one it reports that no model selector is available. `leader c`
(`app.config`) opens all agent session settings, including modes and models.
Forms show one question at a time: Up/Down highlights boolean/enum options,
Enter confirms and advances, Left/Right revisits questions with drafts retained.
Text/number answers also use Enter; text uses Shift/Alt+Enter for newlines and
Ctrl+B/F for cursor movement. Defaults require confirmation, optional questions
can be explicitly skipped, and the final answer triggers validated submission.
Ctrl+E switches to JSON with explicit Ctrl+Enter submission; returning to questions
requires valid JSON without implicitly confirming changed answers. Finite-choice
string arrays use multi-select checkboxes: Up/Down highlights, Space toggles, and
Enter confirms. Clicks toggle checkboxes without confirming. Selection edits
require reconfirmation; defaults remain unconfirmed. Ctrl+U skips optional arrays
or clears required ones; explicit empty selections submit `[]` when valid.
Array JSON round trips compare contents to retain unchanged confirmations.
Other arrays and unrepresentable selections (such as duplicates) retain validated
JSON editing without silently changing values.

The first release targets Linux/macOS. Linux is locally exercised; CI also
targets macOS. Copilot CLI 1.0.105 was verified for ACP initialization, session
creation, and advertised commands/settings. Automated tests use offline agents.

Not yet implemented: remote transports, agent-registry installation, standalone
native executables, background/multi-agent sessions, remote session discovery,
image/audio attachments, terminal-based authentication, leader-key sequences, Git
undo/revert, or free-form array widgets.
Demo sessions cannot resume after their process exits; local transcripts remain.

## Adding an agent

Add a command/args/env definition to the user configuration, launch with --agent,
and check handshake, streaming, tool patches, permission options, cancellation,
advertised settings and session load behavior. Use ACP capabilities rather than
hard-coded agent names. Do not add a provider/model SDK to the TUI.

Docs: https://agentclientprotocol.com/llms.txt and https://opentui.com/docs.
Update this file and the relevant user/development docs when architecture, commands or supported behavior changes.
