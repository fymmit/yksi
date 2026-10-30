# ACP TUI

A keyboard-first terminal interface for AI coding agents. Connect Copilot CLI or
another [ACP](https://agentclientprotocol.com/) agent and use a consistent
conversation, command palette, session history, and coding workflow.

Built with TypeScript, Bun, Solid and OpenTUI. Inspired by OpenCode's interaction
flow.

## Quick start

Requires **Bun 1.4.1+** and a modern terminal on Linux or macOS.

```sh
bun install --frozen-lockfile
bun run demo
```

The offline demo speaks real ACP over stdio. It simulates a code change and
permission request; try `/help`, `/question` and `/slow`. It does not modify files
or call a model.

To use Copilot, install [Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)
and sign in with its CLI, then:

```sh
bun run start
bun run start -- /path/to/project
```

The client launches `copilot --acp --stdio`. No configuration is needed for this
default. Copilot retains responsibility for its models, tools, authentication,
agent instructions, and MCP integrations.

To make the launcher available as `acp-tui` while working on this checkout:

```sh
bun link
acp-tui /path/to/project
acp-tui --demo
```

You can also run `bun /absolute/path/to/acp-tui/bin/acp-tui.ts` from any directory.

## Features

- Streaming Markdown and highlighted code, expandable tool calls and unified diffs.
- Multiline composer, bracketed paste, per-session prompt history and draft retention.
- Searchable command, agent, session, file and model/mode pickers.
- Agent-advertised commands and configuration, including boolean options.
- Permission prompts using the agent's exact options; keyboard-driven structured forms.
- ACP client filesystem operations and bounded, UTF-8-safe terminal output.
- Cancellation, connection error reporting, explicit reconnect and process cleanup.
- SQLite transcript history, supported remote resumption, Markdown export.
- Responsive sidebar with agent plan, reported diffs and context usage when available.
- Light/dark themes and sidebar preferences retained across runs.

## Keyboard flow

| Key | Action |
| --- | --- |
| Enter | Send prompt |
| Shift+Enter / Alt+Enter | Insert newline |
| Ctrl+P | Command palette |
| Ctrl+N | New session |
| Ctrl+S | Project session history |
| Ctrl+A | Choose an agent, opening a new session |
| Ctrl+M | Advertised model, mode and agent settings |
| Ctrl+F | Attach a text file |
| Tab after `/…` | Complete a slash command |
| Tab after `@` | Open the file picker |
| Ctrl+Up / Ctrl+Down | Prompt history |
| Ctrl+O | Expand/collapse tool details, including during permissions |
| Ctrl+B | Toggle sidebar (automatically hidden in narrow terminals) |
| PageUp / PageDown | Scroll conversation |
| Escape | Close picker, cancel an interaction, or cancel the active turn |
| Ctrl+C | Cancel while busy; otherwise quit |
| Ctrl+Q | Quit |

Arrow keys and Enter select in pickers and permission prompts. Tool headers are
also clickable, and the conversation supports mouse scrolling. If Shift+Enter is
not distinguishable in your terminal, use Alt+Enter.

You can compose the next prompt while an agent works; submit after the turn
finishes. Cancellation waits up to five seconds, then disconnects an unresponsive
agent. A second Escape during cancellation disconnects immediately.

### Commands and attachments

Client commands are namespaced, for example `/tui:new`, `/tui:sessions`,
`/tui:agents`, `/tui:reconnect`, `/tui:export`. Agent commands are discovered from
ACP, such as Copilot's `/plan` and `/review`. Type `/` and press Tab, or use Ctrl+P.
Unadvertised slash commands are rejected locally to avoid accidental model calls.

File attachments are explicit selections via Ctrl+F or `@` then Tab. Attached text
is read when submitting (up to 1 MiB per file), embedded as an ACP resource when
supported, otherwise sent as text. Use **Clear attachments** in the palette to
remove the selection. Inline `@path` tokens are not automatically expanded.

Structured forms show **one question at a time** with answer progress. Up/Down
highlights an option; Enter confirms it and moves to the next unanswered question.
Left/Right revisits questions without losing drafts or changing confirmed
choices. Defaults still need confirmation. Once every question is answered or
explicitly skipped, the validated form is submitted automatically.

For text and numbers, type an answer and press Enter. Shift+Enter / Alt+Enter
inserts a text newline; Ctrl+B / Ctrl+F moves the cursor, since Left/Right switches
questions (Home/End also work). Optional choices include **Skip**; Ctrl+U skips an
optional text/number question or clears a required answer. Skipping omits the
property rather than submitting an empty string, zero or false. Required
questions are marked `*`; invalid answers stay open with an error.

Ctrl+D declines and Escape cancels. Ctrl+E switches to advanced JSON editing,
where Ctrl+Enter explicitly validates and submits. Returning to questions
requires valid JSON and does not submit or confirm changed answers. Arrays and
unsupported widget types use JSON automatically, with schema validation still
required. Try `/question` in the offline demo. URL requests display a selectable
link to open in your browser.

## Agent configuration

Create `~/.config/acp-tui/config.json` (or
`$XDG_CONFIG_HOME/acp-tui/config.json`):

```json
{
  "defaultAgent": "copilot",
  "agents": {
    "copilot": {
      "command": "copilot",
      "args": ["--acp", "--stdio"],
      "env": {}
    },
    "other": {
      "command": "/absolute/path/to/another-acp-agent",
      "args": [],
      "env": {}
    }
  }
}
```

`other` is a placeholder: substitute an installed ACP agent's documented command.
Arguments are passed directly, without a shell. The process inherits your
environment; `env` adds or overrides individual values. Configuration is read at
startup. Project-local configuration is not loaded implicitly.

```sh
acp-tui --agent other
acp-tui --config /path/to/config.json --cwd /path/to/project
acp-tui --help
```

See [`config.example.json`](config.example.json). Agents execute with your normal
user privileges. The client presents the permission decisions requested by the
agent; agent-side tool policies remain in effect. Sign in using the agent's own
CLI first. Agent-handled ACP authentication methods, when advertised, are also
available in the command palette.

## History and data

Stored under `~/.local/share/acp-tui/` (or `$XDG_DATA_HOME/acp-tui/`):

- `history.sqlite`: transcripts, remote session IDs, retained terminal output and UI preferences.
- `agent.log`: agent stderr, kept out of the terminal interface.

Set `ACP_TUI_DATA_DIR` to use a separate data directory, e.g. for a demo. Local
history is scoped to the canonical project directory and shows up to 100 recent
sessions. The timeline initially renders the latest 200 entries; **Show earlier
messages** loads more. History and logs may contain the content of your coding
sessions.

Selecting a saved session attempts ACP resume/load only if supported. On a failed
load the local transcript remains readable. It is not silently submitted to a
new agent. Demo sessions are process-local and cannot resume after switching away
or restarting. Export writes `acp-session-<id>.md` in the current project.

## Development and verification

```sh
bun run dev
bun run check
bun run build
bun --preload @opentui/solid/preload dist/index.js --demo
```

The bundle uses the installed `node_modules` for native OpenTUI and other
dependencies; it is not a standalone binary. Both source and test runtime need
the Solid preload configured in `bunfig.toml`.

Tests exercise real stdio ACP connections, permission and question round trips,
cancellation, crash recovery, replay, terminal output, state/persistence, and
headless native UI keyboard/rendering behavior. They require no login or paid
model calls. CI targets Linux and macOS. See [`AGENTS.md`](AGENTS.md) for repository
architecture and guidance for future coding sessions.

### Current scope

This first version implements **stable ACP v1 over local stdio**, with one active
agent process. Remote transports, remote session discovery, multi-agent/background
sessions, image/audio input, terminal-auth handoff, Git undo, configurable keymaps,
and standalone binary distribution are future work. Available UI features depend
on the agent's advertised capabilities.
