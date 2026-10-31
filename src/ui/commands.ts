import type { KeyAction, Keybindings } from "../keybindings";
import type { Choice } from "./picker";

export type ClientCommand = Choice & { action?: KeyAction };
const definitions = {
  help: { action: "app.help", label: "Keyboard shortcuts" },
  new: { action: "app.new", label: "New session" },
  sessions: { action: "app.sessions", label: "Switch session" },
  agents: { action: "app.agents", label: "Switch agent" },
  config: {
    action: "app.config",
    label: "Model, mode and agent settings",
    detail: "advertised by the agent",
  },
  model: { action: "app.model", label: "Choose model" },
  "cycle-mode": { action: "app.cycle-mode", label: "Cycle mode", detail: "next agent mode" },
  usage: {
    action: "app.usage",
    label: "Show session usage",
    detail: "last reported cost and context",
  },
  files: { action: "app.files", label: "Attach file" },
  "clear-attachments": { action: "app.clear-attachments", label: "Clear attachments" },
  reconnect: { action: "app.reconnect", label: "Reconnect current session" },
  sidebar: { action: "app.sidebar", label: "Toggle sidebar" },
  tools: { action: "app.tools", label: "Expand / collapse tool details" },
  thoughts: { action: "app.thoughts", label: "Show / hide reasoning" },
  theme: { action: "app.theme", label: "Choose theme" },
  earlier: { action: "app.earlier", label: "Show earlier messages" },
  export: { action: "app.export", label: "Export transcript to Markdown" },
  paths: { action: "app.paths", label: "Show configuration and data paths" },
  quit: { action: "app.quit", label: "Quit" },
} satisfies Record<string, { action: KeyAction; label: string; detail?: string }>;

type CommandHandlers = Record<keyof typeof definitions, Choice["run"]>;

/** One executable list drives shortcuts, the palette and local slash commands. */
export function createCommands(
  handlers: CommandHandlers,
  dynamic: Choice[],
  keys: Keybindings,
): ClientCommand[] {
  const commands: ClientCommand[] = (Object.keys(definitions) as (keyof typeof definitions)[]).map(
    id => ({ id, ...definitions[id], run: handlers[id] }),
  );
  commands.splice(commands.length - 1, 0, ...dynamic);
  return commands.map(command => ({
    ...command,
    detail:
      [command.action ? keys.label(command.action) : "", command.detail]
        .filter(Boolean)
        .join(" · ") || undefined,
  }));
}
