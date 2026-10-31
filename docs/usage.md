# Using yksi

See the [README](../README.md) to install and launch the app. Shortcuts below are
defaults; [custom keybindings](configuration.md#custom-keybindings) can replace them.
Press **F1** in the app for the current, searchable shortcut reference, including
any configured alternatives or unbound actions.

## Keyboard flow

| Key                        | Action                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| Enter                      | Send prompt                                                         |
| Shift+Enter                | Insert newline                                                      |
| Ctrl+X, P                  | Command palette                                                     |
| F1                         | Open/close keyboard shortcut help                                   |
| Ctrl+X, N                  | New session                                                         |
| Ctrl+X, S                  | Project session history                                             |
| Ctrl+X, A                  | Choose an agent, opening a new session                              |
| Ctrl+X, C                  | Agent model, mode, and other settings                               |
| Ctrl+X, M                  | Choose an advertised model directly                                 |
| Shift+Tab                  | Cycle through advertised agent modes                                |
| Ctrl+X, F                  | Attach a text file                                                  |
| Ctrl+X, T                  | Choose theme                                                        |
| Tab after `/…`             | Complete a slash command                                            |
| Tab after `@`              | Open the file picker                                                |
| Up / Ctrl+P, Down / Ctrl+N | Move in multiline text; browse submitted input at the edges         |
| Ctrl+X, O                  | Expand/collapse tool details, including during permissions          |
| Ctrl+X, B                  | Toggle sidebar (automatically hidden in narrow terminals)           |
| PageUp / PageDown          | Scroll conversation                                                 |
| Escape                     | Close help/picker, cancel an interaction, or cancel the active turn |
| Ctrl+C                     | Cancel while busy; otherwise quit                                   |
| Ctrl+Q                     | Quit                                                                |

Arrow keys and Enter select in pickers and permission prompts. Tool headers are
clickable, and the conversation supports mouse scrolling. Press Ctrl+X, release it, then
press the command letter. The prefix is shown in the header; Escape cancels it,
and it expires after two seconds. Ctrl+P / Ctrl+N also navigate pickers,
permissions, help, form choices, and multiline form text.

In the composer, Up/Down or Ctrl+P/Ctrl+N move through multiline text (including
wrapped lines) before browsing the current session's submitted messages and
typed commands. Down returns to your unsent draft; editing a recalled entry
does not change saved history. Attachments are restored when recalling a sent
message. Older saved transcripts can still browse their sent messages.

You can compose the next prompt while an agent works; submit after the turn
finishes. Cancellation waits up to five seconds, then disconnects an unresponsive
agent. A second Escape during cancellation disconnects immediately.

## Help, status, and settings

The bottom status bar summarizes mode, model, effort, context and cost when
reported, plan progress, and files with reported diffs. The sidebar shows more
detail. At 100 columns or wider, all displayed status fields have labels and the
sidebar is visible by default (subject to your saved visibility preference).
Below 100 columns, most labels are dropped, values shorten, and lower-priority
fields are omitted. Boolean/toggle-like settings keep their labels; file counts
keep their unit. Model names truncate from the beginning so their suffix stays
visible. Context, cost, plan progress, and file counts stay whole or are omitted.

F1 opens searchable **Keyboard shortcuts** help. Search action names, IDs, or
keys; use Up/Down and PageUp/PageDown to scroll. Shortcuts for the current context
appear first. F1 or Escape closes help and restores focus, drafts, and selection
in the underlying composer, picker, or form. Escape closes only help while it is
open; Ctrl+C and Ctrl+Q retain their global behavior. You can also use the
clickable status-bar hint, the palette, or `/tui:help`.

Shift+Tab cycles modes while idle. The active mode and shortcut appear beside
the composer. You can also use **Cycle mode** in the palette or
`/tui:cycle-mode`. The app uses the first ACP config option categorized as
`mode` (including grouped choices or boolean toggles); legacy session modes are
used only when no config options are available. Changes follow agent-confirmed
state, and additional presses during a pending change are ignored.

Choose a model with Ctrl+X, M to remember the last agent-confirmed selection
for that configured agent across projects and restarts. New sessions restore it
from the agent's advertised model choices; resumed/loaded sessions keep their own
model. If the choice is unavailable or rejected, the session remains usable and
a notice explains the fallback. Without an explicit selection, the initial model
comes from the agent. Selecting the already-active model remembers that choice
without sending another model-change request. Ctrl+X, C opens all advertised
session settings.

## Commands, usage, and attachments

Client commands are namespaced, such as `/tui:new`, `/tui:sessions`,
`/tui:agents`, `/tui:reconnect`, `/tui:usage`, and `/tui:export`. Agent commands
are discovered from ACP. Type `/` and press Tab, or open the palette with
Ctrl+X, P. Unadvertised slash commands are rejected locally rather than sent as
prompts.

**Show session usage** in the palette (or `/tui:usage`) displays the latest
agent-reported session cost, context usage, and local receipt time even on narrow
terminals. The palette action preserves your draft; the slash command consumes
only its command text. `app.usage` is unbound by default. Stable ACP usage
updates replace cumulative cost, not add to it. Missing or null cost means
**Not reported**; zero is valid, and invalid values show **Unavailable**. Cost
is shown in the agent's reported currency and may be an estimate, not a bill or
subscription allowance. The last reading and receipt time are saved with the
session, including across history and resumption until a new reading arrives.

File attachments are explicit selections via Ctrl+X, F or `@` then Tab. Attached
text is read on submission (up to 1 MiB per file), embedded as an ACP resource
when supported, otherwise sent as text. Use **Clear attachments** in the palette
to remove them. Inline `@path` tokens are not expanded automatically.
If an attachment cannot be read or is rejected, your draft and attachment selection
stay in the composer. After local preparation succeeds, the submitted draft clears
while the agent works; newer edits made during preparation are preserved.

## Forms and permissions

Permission prompts present the agent's exact options. Structured forms show one
question at a time: Up/Down highlights an option, Enter confirms and advances,
and Left/Right revisits questions while keeping drafts. Defaults still require
confirmation. The form submits automatically once all questions are answered or
explicitly skipped and the answers validate. Required questions are marked `*`;
invalid answers stay open with an error.

Multi-select questions have checkboxes: Up/Down highlights, Space toggles, and
Enter confirms. Clicking toggles without confirming. Changed selections and
defaults need confirmation. Ctrl+U skips optional selections or clears required
ones. **Skip** omits the property; a confirmed empty selection sends `[]` if
valid under the schema.

For text and numbers, type an answer and press Enter. Shift+Enter / Alt+Enter
inserts a text newline, and Ctrl+B / Ctrl+F moves the cursor (Home/End also work).
Ctrl+U skips optional text/number questions or clears required answers. Skipping
omits the property instead of sending an empty string, zero, or false.

Ctrl+D declines and Escape cancels. Ctrl+E switches to advanced JSON editing;
Ctrl+Enter validates and submits JSON. Returning to questions requires valid
JSON and does not implicitly confirm changed answers. Finite-choice string
arrays use checkboxes; other arrays, unsupported widgets, and selections the
checkboxes cannot represent (such as duplicates) use JSON. Schema validation
always applies. Try `/question` in the offline demo. URL requests display a
selectable link to open in your browser.

## History and data

Data is stored under `~/.local/share/yksi/` (or `$XDG_DATA_HOME/yksi/`):

- `history.sqlite`: transcripts, remote session IDs, terminal output, per-agent model selections, and UI preferences.
- `agent.log`: agent stderr, kept out of the terminal interface.

Set `YKSI_DATA_DIR` to use a separate data directory. Local history is scoped
to the canonical project directory and shows up to 100 recent sessions. The
timeline initially renders the latest 200 entries; **Show earlier messages**
loads more. History and logs may contain the content of your coding sessions.
Unreadable saved records are reported in the session picker and left in the database;
other sessions remain available. History write errors appear in the interface while
unsaved sessions are retained in memory and retried at later save opportunities.
If saving still fails at exit, the application reports the failure after restoring
the terminal; unsaved in-memory changes cannot survive process exit.

Selecting a saved session attempts ACP resume/load only when supported. On a
failed load, the local transcript remains readable; it is not silently sent to
a new agent. Offline demo sessions cannot resume after switching away or
restarting. Export writes `acp-session-<id>.md` in the current project.
