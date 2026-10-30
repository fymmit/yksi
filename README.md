# yksi

(IPA: /ˈyksi/)

An agent-agnostic, keyboard-first terminal client for AI coding agents using the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com/). It brings
conversations, tool calls, permissions, sessions, and a command palette into one
interface. The agent handles models, tools, authentication, and its own configuration.

## Run

Requires **Bun 1.4.1+** and a modern terminal on Linux or macOS. From this checkout:

```sh
bun install --frozen-lockfile
bun run demo
```

The demo works offline, with no model account or file changes. To use the built-in
Copilot CLI default, install [Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)
and sign in with its CLI, then run:

```sh
bun run start                     # current directory
bun run start -- /path/to/project
```

For a `yksi` command while working on this checkout, run `bun link`. Then use
`yksi /path/to/project` or `yksi --demo` from any directory. `yksi --help` lists
the available options.

## Configure an agent

Create `~/.config/yksi/config.json` (or `$XDG_CONFIG_HOME/yksi/config.json`):

```json
{
  "defaultAgent": "my-agent",
  "agents": {
    "my-agent": {
      "command": "/path/to/installed-acp-agent",
      "args": ["<agent's stdio ACP arguments>"]
    }
  }
}
```

Replace the example command and arguments with those documented by your ACP
agent. Sign in using its own CLI if needed. You can define multiple agents and
select one with `bun run start -- --agent NAME` (or `yksi --agent NAME` after
linking). Use `--config /path/to/config.json` for a different configuration file.
No configuration file is needed for the Copilot CLI default. See the
[configuration guide](docs/configuration.md) for environment variables, themes,
and keybindings.

## Basics

- Type a prompt and press **Enter**; use **Shift+Enter** for a newline.
- Press **Ctrl+X**, then **P** for the command palette; **F1** shows all shortcuts.
- Press **Ctrl+X**, then **S** for session history, or **Ctrl+X**, then **A** to choose an agent.
- Press **Ctrl+C** to cancel a busy turn or quit when idle.

See the [user guide](docs/usage.md) for commands, attachments, permissions,
session history, and other controls. Contributors can start with the
[development guide](docs/development.md) and [repository guide](AGENTS.md).
