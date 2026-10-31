# Configuration

Create `~/.config/yksi/config.json` (or
`$XDG_CONFIG_HOME/yksi/config.json`). Configuration is loaded at startup;
project-local configuration is not loaded implicitly. For a full example, see
[`config.example.json`](../config.example.json).

## Agents

The built-in default launches `opencode acp`; install
[OpenCode](https://opencode.ai/v2/docs/) first. OpenCode offers free models,
though availability, authentication, and costs depend on the model/provider you
choose. The optional built-in Copilot agent launches `copilot --acp --stdio`;
install and sign in to Copilot CLI before using `--agent copilot`. Other installed
ACP agents can be configured with the command and arguments documented by the
agent:

```json
{
  "defaultAgent": "my-agent",
  "agents": {
    "my-agent": {
      "command": "/path/to/installed-acp-agent",
      "args": ["<agent's stdio ACP arguments>"],
      "env": {}
    }
  }
}
```

Replace the placeholder command and arguments before running. When specifying
`agents`, include every agent you intend to use: the built-in OpenCode and Copilot
definitions are not merged into your custom list. `defaultAgent` must name one of
your agents; it defaults to `opencode` if omitted. If you replace `agents` without
an `opencode` entry, set `defaultAgent` to an agent you included. `args` and `env`
default to empty. Arguments
are passed directly, without a shell. The agent inherits your environment;
`env` adds or overrides individual variables. Agents run with your user
privileges. The client presents permission decisions requested by the agent;
agent-side tool policies remain in effect. Sign in through the agent's CLI in a
separate terminal when needed; terminal-based authentication is not supported
inside yksi.

```sh
yksi --agent my-agent
yksi --config /path/to/config.json --cwd /path/to/project
yksi --help
```

The equivalent source-checkout invocation is
`bun run start -- /path/to/project --agent my-agent`.

### Other ACP agents

These are examples of local stdio agents; install and authenticate them according
to their linked documentation. They are **not** bundled with yksi. Provider
subscriptions, free tiers, and model availability vary.

| Agent                                                                                           | Command            | Arguments              | Setup                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| [OpenCode](https://opencode.ai/v2/docs/cli/acp/) (default)                                      | `opencode`         | `["acp"]`              | Install OpenCode; select a model.                                                             |
| [Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) (built in) | `copilot`          | `["--acp", "--stdio"]` | Install Copilot CLI and sign in.                                                              |
| [Gemini CLI](https://geminicli.com/docs/cli/acp-mode/)                                          | `gemini`           | `["--acp"]`            | Install Gemini CLI and set up its authentication.                                             |
| [Claude Agent](https://github.com/agentclientprotocol/claude-agent-acp)                         | `claude-agent-acp` | `[]`                   | Install the `@agentclientprotocol/claude-agent-acp` adapter and configure Claude credentials. |
| [Codex](https://github.com/agentclientprotocol/codex-acp)                                       | `codex-acp`        | `[]`                   | Install the `@agentclientprotocol/codex-acp` adapter and configure Codex authentication.      |

For example, after installing Gemini CLI, add it alongside the built-in choices
in your global configuration (custom `agents` replaces the entire built-in list):

```json
{
  "defaultAgent": "opencode",
  "agents": {
    "opencode": { "command": "opencode", "args": ["acp"] },
    "copilot": { "command": "copilot", "args": ["--acp", "--stdio"] },
    "gemini": { "command": "gemini", "args": ["--acp"] }
  }
}
```

Run `yksi --agent gemini` to use that agent. To add Claude Agent or Codex,
install the linked adapter and add an entry using its command from the table.
The `claude` and `codex` CLIs alone are not ACP commands; use their adapters.

## Themes

Press Ctrl+X, T, choose **Choose theme** in the palette, or run `/tui:theme`.
Type to filter; Enter applies and Escape cancels. Switching immediately updates
the interface, Markdown, code, and diffs without losing your draft.

| Family      | Preset IDs                                                                          |
| ----------- | ----------------------------------------------------------------------------------- |
| yksi        | `dark`, `light`                                                                     |
| Gruvbox     | `gruvbox-dark`, `gruvbox-light`                                                     |
| Catppuccin  | `catppuccin-latte`, `catppuccin-frappe`, `catppuccin-macchiato`, `catppuccin-mocha` |
| GitHub      | `github-dark`, `github-light`                                                       |
| Dracula     | `dracula`                                                                           |
| Nord        | `nord`                                                                              |
| Tokyo Night | `tokyo-night`                                                                       |

Palettes adapt colors from [Gruvbox](https://github.com/morhetz/gruvbox),
[Catppuccin](https://github.com/catppuccin/palette),
[GitHub Primer](https://github.com/primer/primitives),
[Dracula](https://github.com/dracula/dracula-theme),
[Nord](https://github.com/nordtheme/nord), and
[Tokyo Night](https://github.com/folke/tokyonight.nvim).

The picker selection is saved across projects and restarts. An explicit `theme`
in global configuration wins at startup, followed by the saved selection, then
`dark`. If a saved custom theme has been removed, startup falls back to `dark`.
Picker choices still apply immediately even with an explicit startup `theme`.
Omit that setting to always start with your last selection.

To customize colors, add a named theme extending a built-in preset:

```json
{
  "theme": "my-mocha",
  "themes": {
    "my-mocha": {
      "extends": "catppuccin-mocha",
      "colors": {
        "background": "#181825",
        "accent": "#cba6f7",
        "cursor": "#f5e0dc"
      },
      "syntax": {
        "keyword": "#f38ba8",
        "comment": "#9399b2"
      },
      "markdown": {
        "heading": "#b4befe"
      }
    }
  }
}
```

Names use lowercase letters, numbers, and hyphens and cannot replace a built-in.
`extends` must name a built-in preset. Omitted values inherit from that preset
independently. Colors use six-digit `#RRGGBB` hex values. Unknown names, keys, or
invalid colors are configuration errors; restart after editing definitions.

### Theme override reference

| Object                           | Keys                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `colors`: base UI                | `background`, `panel`, `border`, `focusBorder`, `text`, `muted`, `accent`, `warning`, `error`                                                                                        |
| `colors`: editors                | `inputBackground`, `inputText`, `inputFocusedBackground`, `inputFocusedText`, `placeholder`, `cursor`                                                                                |
| `colors`: text selection         | `selectionBackground`, `selectionText`                                                                                                                                               |
| `colors`: highlighted picker row | `selectedBackground`, `selectedText`, `selectedMuted`                                                                                                                                |
| `colors`: scrollbars             | `scrollbarTrack`, `scrollbarThumb`, `scrollbarArrow`, `scrollbarArrowBackground`                                                                                                     |
| `colors`: diff rows              | `diffAddedBackground`, `diffRemovedBackground`, `diffContextBackground`                                                                                                              |
| `colors`: diff content           | `diffAddedContentBackground`, `diffRemovedContentBackground`, `diffContextContentBackground`                                                                                         |
| `colors`: diff gutters           | `diffAddedSign`, `diffRemovedSign`, `diffLineNumber`, `diffLineNumberBackground`, `diffAddedLineNumberBackground`, `diffRemovedLineNumberBackground`                                 |
| `syntax`                         | `default`, `keyword`, `string`, `comment`, `number`, `boolean`, `function`, `type`, `variable`, `constant`, `property`, `operator`, `punctuation`, `tag`, `attribute`, `constructor` |
| `markdown`                       | `heading`, `link`, `linkUrl`, `raw`, `rawBackground`, `codeBackground`, `quote`, `list`, `strong`, `italic`, `strikethrough`, `conceal`, `tableBorder`                               |

`selectedMuted` controls secondary text on highlighted picker rows. Diff content
and gutter overrides take precedence over row backgrounds. Markdown `raw` and
`rawBackground` style inline code; `codeBackground` styles fenced code.
`heading` covers all heading levels and table headers; `conceal` also colors
quote borders. Unclassified highlighted code uses `syntax.default`.

## Custom keybindings

Set `leader` and `keybindings` in the global configuration. The leader defaults
to `ctrl+x`; changing it updates every `leader …` binding. It must be one key
combination. For example, to use Ctrl+G as leader, send with Ctrl+Enter, and
insert newlines with Enter:

```json
{
  "leader": "ctrl+g",
  "keybindings": {
    "app.commands": ["leader p", "f2"],
    "composer.submit": ["ctrl+enter"],
    "composer.newline": ["enter", "shift+enter", "alt+enter"],
    "app.sidebar": []
  }
}
```

- Omitted actions inherit defaults. An array **replaces** an action's shortcuts;
  `[]` disables them. Client commands remain available in the palette and through
  `/tui:…` even without shortcuts. Changes take effect on restart, including in
  the offline demo.
- Keys are case-insensitive. Use letters, digits, punctuation, `f1`–`f24`, or
  `enter`, `escape`, `tab`, `space`, `backspace`, `delete`, `insert`, `home`, `end`,
  `up`, `down`, `left`, `right`, `pageup`, `pagedown`, `linefeed`. Combine with
  `ctrl+`, `shift+`, `alt+` (or `meta+`), and `super+`. Aliases include
  `return`/`kpenter`, `esc`, `pgup`, `pgdn`, `spacebar`, `plus`, and `minus`.
- Modifiers match exactly. Bind one key or a two-key sequence such as `leader p`
  or `ctrl+x p`. `leader` is only valid as a sequence's first key; literal
  sequences do not change with the leader. Sequences work for application
  commands; other actions use single keys. A sequence prefix cannot also be a
  single-key binding in the same context.
- Unknown actions, invalid keys, duplicate alternatives, and conflicting
  bindings active in the same context fail validation at startup. Keys can be
  reused in separate contexts. Application/form bindings take priority over
  built-in text editing in their active context.
- Inline hints show the first shortcut; palette entries show every alternative.
  Terminal support determines which combinations can be distinguished (some
  terminals send Enter for Ctrl+M or cannot distinguish Shift+Enter).

### Action reference

Application actions are active with the composer, except where noted:

| Action                            | Default               | Behavior                                                                       |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `app.commands`                    | `leader p`            | Open command palette                                                           |
| `app.help`                        | `f1`                  | Open/close keyboard shortcuts; active everywhere                               |
| `app.new`                         | `leader n`            | New session                                                                    |
| `app.sessions`                    | `leader s`            | Switch session                                                                 |
| `app.agents`                      | `leader a`            | Switch agent                                                                   |
| `app.config`                      | `leader c`            | Agent model/mode/settings                                                      |
| `app.model`                       | `leader m`            | Choose an agent-advertised model directly                                      |
| `app.cycle-mode`                  | `shift+tab`           | Cycle advertised agent modes                                                   |
| `app.files`                       | `leader f`            | Attach file                                                                    |
| `app.sidebar`                     | `leader b`            | Toggle sidebar                                                                 |
| `app.tools`                       | `leader o`            | Toggle tool details; suspended in help                                         |
| `app.quit`                        | `ctrl+q`              | Quit; active everywhere                                                        |
| `app.interrupt`                   | `ctrl+c`              | Cancel while busy, otherwise quit; active everywhere                           |
| `app.cancel`                      | `escape`              | Close help/picker, cancel interaction/turn, or clear notice/error              |
| `app.scrollUp` / `app.scrollDown` | `pageup` / `pagedown` | Scroll transcript; also active in pickers/permissions, suspended in forms/help |
| `app.clear-attachments`           | Unbound               | Clear attachments                                                              |
| `app.reconnect`                   | Unbound               | Reconnect current session                                                      |
| `app.thoughts`                    | Unbound               | Toggle reasoning visibility                                                    |
| `app.theme`                       | `leader t`            | Choose theme                                                                   |
| `app.earlier`                     | Unbound               | Show earlier messages                                                          |
| `app.export`                      | Unbound               | Export transcript                                                              |
| `app.paths`                       | Unbound               | Show configuration/data paths                                                  |
| `app.usage`                       | Unbound               | Show last reported session cost/context                                        |

Composer, picker, help, and interaction actions are active only in their corresponding UI:

| Action                                              | Default                           | Behavior                                        |
| --------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `composer.submit`                                   | `enter`                           | Send prompt or run client command               |
| `composer.newline`                                  | `shift+enter`                     | Insert newline                                  |
| `composer.complete`                                 | `tab`                             | Complete `/…` or attach file after `@`          |
| `composer.historyPrevious` / `composer.historyNext` | `up`, `ctrl+p` / `down`, `ctrl+n` | Browse submitted input at composer edges        |
| `picker.previous` / `picker.next`                   | `up`, `ctrl+p` / `down`, `ctrl+n` | Highlight choice                                |
| `picker.confirm`                                    | `enter`                           | Select choice                                   |
| `help.previous` / `help.next`                       | `up`, `ctrl+p` / `down`, `ctrl+n` | Scroll shortcut reference                       |
| `help.pageUp` / `help.pageDown`                     | `pageup` / `pagedown`             | Page shortcut reference                         |
| `permission.previous` / `permission.next`           | `up`, `ctrl+p` / `down`, `ctrl+n` | Highlight permission/URL-request option         |
| `permission.confirm`                                | `enter`                           | Confirm highlighted agent option                |
| `form.decline`                                      | `ctrl+d`                          | Decline form, including JSON mode               |
| `form.toggleJson`                                   | `ctrl+e`                          | Switch questions/JSON                           |
| `form.submitJson`                                   | `ctrl+enter`                      | Validate and submit JSON                        |
| `form.jsonNewline`                                  | `enter`                           | Insert newline in JSON                          |
| `form.previous` / `form.next`                       | `left` / `right`                  | Revisit question                                |
| `form.confirm`                                      | `enter`, `ctrl+enter`             | Confirm question and advance                    |
| `form.clear`                                        | `ctrl+u`                          | Skip optional question or clear required answer |
| `form.optionPrevious` / `form.optionNext`           | `up`, `ctrl+p` / `down`, `ctrl+n` | Highlight question option                       |
| `form.toggle`                                       | `space`                           | Toggle highlighted checkbox                     |
| `form.cursorLeft` / `form.cursorRight`              | `ctrl+b` / `ctrl+f`               | Move cursor in text/number answers              |
| `form.cursorUp` / `form.cursorDown`                 | `ctrl+p` / `ctrl+n`               | Move cursor in text and JSON answers            |
| `form.newline`                                      | `shift+enter`, `alt+enter`        | Insert newline in text/number editor            |

Question confirmation, skipping, toggling, and JSON submission ignore key-repeat
events so holding a key cannot confirm multiple answers. Navigation can repeat.
