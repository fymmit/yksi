# ACP TUI — repository guide

## Purpose

A general, keyboard-first terminal client for AI coding agents using the **Agent
Client Protocol (ACP)**. The desired UX follows OpenCode's interaction flow
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
bun run check                 # strict type-check + tests
bun run build                 # Bun bundle in dist/ (native deps stay external)
```

`bunfig.toml` must preload `@opentui/solid/preload` for **both runtime and tests**.
Otherwise Bun runs Solid's server implementation / untransformed JSX. The bin
launcher installs this preload before dynamically importing the app so it works
from other directories. Bundles require the preload too (see README).

## Layout

- `src/index.tsx`: CLI parsing, terminal lifecycle, application wiring.
- `src/config.ts`: validated global agent definitions, XDG paths, demo launch.
- `src/keybindings.ts`: typed action/default/context registry, validated global
  overrides, exact key matching, and shortcut labels.
- `src/acp/client.ts`: SDK fluent client, stdio, capabilities, stderr and timeouts.
- `src/acp/files.ts`, `src/acp/terminals.ts`: ACP client resource methods.
- `src/controller.ts`: connection/session lifecycle, permission and question
  queues, cancellation, turn submission, replay, settings, throttled snapshots.
- `src/state.ts`: serializable conversation model and update reducer.
- `src/storage.ts`: SQLite persistence, workspace-scoped local history.
- `src/ui/`: Solid components, palette, composer, tool/diff rendering and themes.
  `usage.ts` formats reported session cost and the local `/tui:usage` summary.
  `form.tsx` and `form-state.ts` render and validate keyboard-driven elicitation
  forms, with checkbox multi-selects for finite-choice string arrays and JSON
  fallback for other arrays and unsupported widget types.
- `src/demo-agent.ts`: real stdio ACP demo; simulated edits, no model service.
- `tests/fixtures/agent.ts`: deterministic protocol fixture for lifecycle tests.
- `bin/acp-tui.ts`, `scripts/build.ts`: launcher and bundle build.

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
- Resolve pending interaction promises on cancellation/disconnect. An agent's
  permission option IDs and scope labels are authoritative.
- ACP paths are absolute, line numbers 1-based. Filesystem and command execution
  use the launching user's privileges; honor the agent's permission flow.
- Agent stdout is reserved for NDJSON; capture stderr to the log. On shutdown,
  restore the terminal, close SQLite, and terminate owned process groups.
- UI state/settings are local. Do not automatically execute project-local agent
  configuration. The only configuration is the global file or explicit --config.
- Keybindings are startup-loaded overrides in that configuration: omitted actions
  inherit defaults, arrays replace shortcuts, and `[]` disables them. Contexts
  permit key reuse only where actions cannot overlap. Keep handlers and hints
  sourced from `src/keybindings.ts`; inline hints use the first alternative and
  palette details show all alternatives. No leader sequences. Consume handled
  keys before other handlers/widgets; suppress managed OpenTUI editor defaults
  with `src/ui/keybindings.ts` so disabled/remapped keys cannot fall through.
  Confirmation/submission/toggle actions ignore repeat events; navigation repeats.
- Keep dependencies pinned via `bun.lock`; do not edit vendored dependencies.
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
Standard ACP context and cumulative session cost appear in the sidebar when
reported; **Show session usage** / `/tui:usage` shows a snapshot with local receipt
time, including on narrow terminals. `app.usage` is unbound by default.
Input history is per
session; drafts survive session switches within the running TUI.
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
Update this file and README when architecture, commands or supported behavior changes.
