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
- Remembered model selections per agent, across new sessions and application restarts.
- Permission prompts using the agent's exact options; keyboard-driven structured forms.
- ACP client filesystem operations and bounded, UTF-8-safe terminal output.
- Cancellation, connection error reporting, explicit reconnect and process cleanup.
- SQLite transcript history, supported remote resumption, Markdown export.
- Responsive sidebar with agent plan, reported diffs, context usage and reported session cost when available.
- Compact session status bar and searchable floating keyboard help.
- Light/dark themes and sidebar preferences retained across runs.
- Configurable, context-aware keyboard shortcuts with hints that follow your settings.

## Keyboard flow

These are the default bindings. See [Custom keybindings](#custom-keybindings) to
change them.

| Key                     | Action                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| Enter                   | Send prompt                                                         |
| Shift+Enter / Alt+Enter | Insert newline                                                      |
| Ctrl+P                  | Command palette                                                     |
| F1                      | Open/close keyboard shortcut help                                   |
| Ctrl+N                  | New session                                                         |
| Ctrl+S                  | Project session history                                             |
| Ctrl+A                  | Choose an agent, opening a new session                              |
| Ctrl+M                  | Advertised model, mode and agent settings                           |
| Shift+Tab               | Cycle through advertised agent modes                                |
| Ctrl+F                  | Attach a text file                                                  |
| Tab after `/…`          | Complete a slash command                                            |
| Tab after `@`           | Open the file picker                                                |
| Ctrl+Up / Ctrl+Down     | Prompt history                                                      |
| Ctrl+O                  | Expand/collapse tool details, including during permissions          |
| Ctrl+B                  | Toggle sidebar (automatically hidden in narrow terminals)           |
| PageUp / PageDown       | Scroll conversation                                                 |
| Escape                  | Close help/picker, cancel an interaction, or cancel the active turn |
| Ctrl+C                  | Cancel while busy; otherwise quit                                   |
| Ctrl+Q                  | Quit                                                                |

Arrow keys and Enter select in pickers and permission prompts. Tool headers are
also clickable, and the conversation supports mouse scrolling. If Shift+Enter is
not distinguishable in your terminal, use Alt+Enter.

The bottom status bar summarizes settings (prioritizing model and mode),
reported context/cost, completed/total plan steps, and the number
of files with reported diffs. It uses readable setting choices and compact counts.
Fields appear in a fixed order: Mode, Model, Effort (ACP `thought_level`), Context,
Cost, Plan, Files, then other settings sorted by ACP ID. Settings in the same
category are also sorted by ID.
At **100 columns or wider**, all displayed fields have labels. Below 100 columns,
fields show values only, except boolean settings and toggle-like select values
(On/Off, Yes/No, True/False, Enabled/Disabled) retain their labels (such as
`Allow All: Off`). File counts retain their unit (such as `1 file` or `3 files`). Narrow terminals shorten
values and omit lower-priority fields, keeping usage and
the help shortcut visible when space permits. Long model names lose their beginning
to preserve the model/version suffix; other setting values and labels lose their
end. Context, cost, plan progress, and file counts are displayed whole or omitted.
The sidebar shows the full details;
it remains visible by default at **100 columns or wider**, respecting your saved
visibility preference.

**F1** opens a floating **Keyboard shortcuts** window. Type to search action names,
action IDs, or configured keys; Up/Down and PageUp/PageDown scroll. Shortcuts for
the context you opened it from appear first, followed by the other sections.
All configured alternatives and unbound actions are included. F1 or Escape closes
help and restores focus, drafts, and selections in the composer, picker, or form.
Escape closes only help while it is open; Ctrl+C and Ctrl+Q retain their global
behavior. The status bar's help hint is also clickable. Help is available through
the command palette or `/tui:help`, including when `app.help` is unbound.

You can compose the next prompt while an agent works; submit after the turn
finishes. Cancellation waits up to five seconds, then disconnects an unresponsive
agent. A second Escape during cancellation disconnects immediately.

**Shift+Tab** cycles modes while the session is idle, wrapping to the first choice.
The active mode and shortcut appear beside the composer, including on narrow
terminals. The same action is available as **Cycle mode** in the command palette
or `/tui:cycle-mode`. Rebind or disable it with `app.cycle-mode`.
Mode cycling uses the first ACP config option categorized as `mode` (including
grouped choices or a boolean toggle), or the older session modes API when the
agent provides no config options. Uncategorized settings remain available through
Ctrl+M. Repeated key events and additional presses while a setting change is
pending are ignored; the displayed mode follows agent-confirmed state.

Choose a model through **Ctrl+M** to remember it for future sessions. The last
agent-confirmed selection is saved per configured agent, across projects and
application restarts. New sessions restore it before accepting prompts, using the
agent's ACP `model` config category and advertised choices. Resumed/loaded sessions
keep their own model. If the remembered model is unavailable or the agent rejects
it, a notice explains the fallback and the session remains usable; the preference
is retained for the next new session. Until you select a model, the initial model
comes from the agent.

### Commands and attachments

Client commands are namespaced, for example `/tui:new`, `/tui:sessions`,
`/tui:agents`, `/tui:reconnect`, `/tui:usage`, `/tui:export`. Agent commands are discovered from
ACP, such as Copilot's `/plan` and `/review`. Type `/` and press Tab, or use Ctrl+P.
Unadvertised slash commands are rejected locally to avoid accidental model calls.

**Show session usage** in the palette (or `/tui:usage`) displays a local snapshot
of the latest agent-reported session cost, context usage and receipt time. It also
works with the sidebar hidden or on narrow terminals. The palette action preserves
your draft; the slash command consumes only its command text. You can assign a
shortcut to `app.usage` (unbound by default).

Cost comes from stable ACP `usage_update` notifications and is shown in the agent's
reported currency. Each update replaces the cumulative total; missing or null cost
shows **Not reported**, while zero remains a valid cost. Costs over one cent show
two fraction digits; amounts at or below one cent retain precision, using
scientific notation below 0.000001. Invalid cost values
show **Unavailable**. Cost and its local receipt time are saved with the session;
history and resumed sessions retain the last reading until another update arrives.
Older transcripts may have no receipt timestamp. Reported cost may be an estimate
and does not indicate subscription allowance, remaining budget or an actual bill.

File attachments are explicit selections via Ctrl+F or `@` then Tab. Attached text
is read when submitting (up to 1 MiB per file), embedded as an ACP resource when
supported, otherwise sent as text. Use **Clear attachments** in the palette to
remove the selection. Inline `@path` tokens are not automatically expanded.

Structured forms show **one question at a time** with answer progress. Up/Down
highlights an option; Enter confirms it and moves to the next unanswered question.
Left/Right revisits questions without losing drafts or changing confirmed
choices. Defaults still need confirmation. Once every question is answered or
explicitly skipped, the validated form is submitted automatically.

Multi-select questions show checkboxes: Up/Down highlights an option, Space toggles
it, and Enter confirms the selection. Clicking a checkbox toggles it without
confirming. Defaults and changed selections need confirmation. Ctrl+U skips an
optional selection or clears a required one. **Skip** omits the property; confirming
an empty selection sends `[]` when the schema allows it.

For text and numbers, type an answer and press Enter. Shift+Enter / Alt+Enter
inserts a text newline; Ctrl+B / Ctrl+F moves the cursor, since Left/Right switches
questions (Home/End also work). Optional choices include **Skip**; Ctrl+U skips an
optional text/number question or clears a required answer. Skipping omits the
property rather than submitting an empty string, zero or false. Required
questions are marked `*`; invalid answers stay open with an error.

Ctrl+D declines and Escape cancels. Ctrl+E switches to advanced JSON editing,
where Ctrl+Enter explicitly validates and submits. Returning to questions
requires valid JSON and does not submit or confirm changed answers. String arrays
with finite choices use multi-select controls; other arrays and unsupported widget
types use JSON automatically. Selections that checkboxes cannot represent, such as
duplicate array entries, remain in JSON without losing values. Schema validation
is always required. Try `/question` in the offline demo. URL requests display a selectable
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

### Custom keybindings

Add `keybindings` to the same global configuration file (or the file selected by
`--config`). For example, to send with Ctrl+Enter and insert newlines with Enter:

```json
{
  "keybindings": {
    "app.commands": ["ctrl+p", "f2"],
    "composer.submit": ["ctrl+enter"],
    "composer.newline": ["enter", "shift+enter", "alt+enter"],
    "app.theme": ["alt+t"],
    "app.sidebar": []
  }
}
```

- Omitted actions inherit their defaults. An array **replaces** an action's
  shortcuts; `[]` disables its shortcuts. Client commands remain available in
  the command palette and through `/tui:…` even when their shortcuts are disabled.
- Changes take effect on restart. Configuration is global, including when the
  offline demo is selected.
- Keys are case-insensitive. Use letters, digits, punctuation, `f1`–`f24`, or
  named keys: `enter`, `escape`, `tab`, `space`, `backspace`, `delete`, `insert`,
  `home`, `end`, `up`, `down`, `left`, `right`, `pageup`, `pagedown`, `linefeed`.
  Combine with `ctrl+`, `shift+`, `alt+` (or `meta+`), and `super+`.
  Aliases include `return`/`kpenter` for Enter, `esc`, `pgup`, `pgdn`, `spacebar`,
  and `plus`/`minus` for `+`/`-`. For example, use `ctrl+plus` for Ctrl++.
- Modifiers match exactly: `ctrl+p` does not also match `ctrl+shift+p`. Each entry
  describes one key combination; leader sequences are not supported.
- Unknown actions, invalid keys, duplicate alternatives, and conflicts between
  actions active in the same context produce configuration errors at startup.
  Rebind or disable the conflicting action as well. A key can be reused in
  separate contexts, such as `app.sidebar` and `form.cursorLeft`.
- Application/form bindings take priority over built-in text editing in their
  active context. Other native editing shortcuts still work. Unmodified letters
  assigned to an action consume those letters while that action is active.
- Inline hints show the first configured shortcut; command palette entries show
  all alternatives. Terminal support determines which combinations can be
  distinguished: for example, some terminals send Enter for Ctrl+M or cannot
  distinguish Shift+Enter. Use a combination your terminal can report.

#### Action reference

Application actions are active with the composer, except where noted:

| Action                            | Default               | Behavior                                                                       |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `app.commands`                    | `ctrl+p`              | Open command palette                                                           |
| `app.help`                        | `f1`                  | Open/close keyboard shortcuts; active everywhere                               |
| `app.new`                         | `ctrl+n`              | New session                                                                    |
| `app.sessions`                    | `ctrl+s`              | Switch session                                                                 |
| `app.agents`                      | `ctrl+a`              | Switch agent                                                                   |
| `app.config`                      | `ctrl+m`              | Agent model/mode/settings                                                      |
| `app.cycle-mode`                  | `shift+tab`           | Cycle advertised agent modes                                                   |
| `app.files`                       | `ctrl+f`              | Attach file                                                                    |
| `app.sidebar`                     | `ctrl+b`              | Toggle sidebar                                                                 |
| `app.tools`                       | `ctrl+o`              | Toggle tool details; suspended in help                                         |
| `app.quit`                        | `ctrl+q`              | Quit; active everywhere                                                        |
| `app.interrupt`                   | `ctrl+c`              | Cancel while busy, otherwise quit; active everywhere                           |
| `app.cancel`                      | `escape`              | Close help/picker, cancel interaction/turn, or clear notice/error              |
| `app.scrollUp` / `app.scrollDown` | `pageup` / `pagedown` | Scroll transcript; also active in pickers/permissions, suspended in forms/help |
| `app.clear-attachments`           | Unbound               | Clear attachments                                                              |
| `app.reconnect`                   | Unbound               | Reconnect current session                                                      |
| `app.thoughts`                    | Unbound               | Toggle reasoning visibility                                                    |
| `app.theme`                       | Unbound               | Toggle theme                                                                   |
| `app.earlier`                     | Unbound               | Show earlier messages                                                          |
| `app.export`                      | Unbound               | Export transcript                                                              |
| `app.paths`                       | Unbound               | Show configuration/data paths                                                  |
| `app.usage`                       | Unbound               | Show last reported session cost/context                                        |

Composer, picker, help, and interaction actions are active only in their corresponding UI:

| Action                                              | Default                    | Behavior                                        |
| --------------------------------------------------- | -------------------------- | ----------------------------------------------- |
| `composer.submit`                                   | `enter`                    | Send prompt or run client command               |
| `composer.newline`                                  | `shift+enter`, `alt+enter` | Insert newline                                  |
| `composer.complete`                                 | `tab`                      | Complete `/…` or attach file after `@`          |
| `composer.historyPrevious` / `composer.historyNext` | `ctrl+up` / `ctrl+down`    | Browse prompt history                           |
| `picker.previous` / `picker.next`                   | `up` / `down`              | Highlight choice                                |
| `picker.confirm`                                    | `enter`                    | Select choice                                   |
| `help.previous` / `help.next`                       | `up` / `down`              | Scroll shortcut reference                       |
| `help.pageUp` / `help.pageDown`                     | `pageup` / `pagedown`      | Page shortcut reference                         |
| `permission.previous` / `permission.next`           | `up` / `down`              | Highlight permission/URL-request option         |
| `permission.confirm`                                | `enter`                    | Confirm highlighted agent option                |
| `form.decline`                                      | `ctrl+d`                   | Decline form, including JSON mode               |
| `form.toggleJson`                                   | `ctrl+e`                   | Switch questions/JSON                           |
| `form.submitJson`                                   | `ctrl+enter`               | Validate and submit JSON                        |
| `form.jsonNewline`                                  | `enter`                    | Insert newline in JSON                          |
| `form.previous` / `form.next`                       | `left` / `right`           | Revisit question                                |
| `form.confirm`                                      | `enter`, `ctrl+enter`      | Confirm question and advance                    |
| `form.clear`                                        | `ctrl+u`                   | Skip optional question or clear required answer |
| `form.optionPrevious` / `form.optionNext`           | `up` / `down`              | Highlight question option                       |
| `form.toggle`                                       | `space`                    | Toggle highlighted checkbox                     |
| `form.cursorLeft` / `form.cursorRight`              | `ctrl+b` / `ctrl+f`        | Move cursor in text/number answers              |
| `form.newline`                                      | `shift+enter`, `alt+enter` | Insert newline in text/number editor            |

Question confirmation, skipping, toggling, and JSON submission ignore key-repeat
events so holding a key cannot confirm multiple answers. Navigation can repeat.

## History and data

Stored under `~/.local/share/acp-tui/` (or `$XDG_DATA_HOME/acp-tui/`):

- `history.sqlite`: transcripts, remote session IDs, retained terminal output, per-agent model selections and UI preferences.
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
bun install --frozen-lockfile
bun run dev
bun run format:check
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

### Formatting and commit hooks

Biome formats JavaScript/TypeScript (including TSX), JSON/JSONC, Markdown, and
YAML. Run `bun run format` to format the project, or `bun run format:check` to
check it without writing changes. CI enforces the same formatting on Linux and
macOS. Dependencies, generated `dist/` output, `bun.lock`, and Git-ignored files
are excluded. Biome uses two-space indentation, double quotes, semicolons, and
a preferred line width of 100. Its version is pinned for reproducible output.

`bun install` installs the Husky pre-commit hook through the `prepare` script.
The hook runs lint-staged and Biome on whole staged files, automatically staging
the formatted result. lint-staged temporarily hides unstaged edits in partially
staged files and restores them afterward. Bun must be on the committing process's
`PATH`. Set `HUSKY=0` to skip hook installation/execution in CI.

Bulk formatting belongs in a dedicated `style:` commit containing only formatter
output. Record its full commit hash in `.git-blame-ignore-revs` in a subsequent
commit, including after formatter upgrades that change output broadly. Enable
the shared ignore list for local blame once per checkout:

```sh
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub also uses this file in its blame view. Preserve these commits when merging
(avoid squash/rebase that changes the recorded hash), or update the ignore list
to the formatting commit's final hash afterward. Existing history is not rewritten.

### Current scope

This first version implements **stable ACP v1 over local stdio**, with one active
agent process. Remote transports, remote session discovery, multi-agent/background
sessions, image/audio input, terminal-auth handoff, Git undo, leader-key sequences,
and standalone binary distribution are future work. Available UI features depend
on the agent's advertised capabilities.
