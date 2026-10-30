import { z } from "zod";

export type KeyContext =
  | "composer"
  | "picker"
  | "permission"
  | "form.text"
  | "form.choice"
  | "form.json"
  | "help";
const all: KeyContext[] = [
  "composer",
  "picker",
  "permission",
  "form.text",
  "form.choice",
  "form.json",
];
const global: KeyContext[] = [...all, "help"];
const form: KeyContext[] = ["form.text", "form.choice", "form.json"];
const questions: KeyContext[] = ["form.text", "form.choice"];
const action = (contexts: KeyContext[], ...keys: string[]) => ({ contexts, keys });

/** Stable configuration IDs. Contexts describe where actions can consume a key. */
export const keyActions = {
  "app.commands": action(["composer"], "leader p"),
  "app.help": action(global, "f1"),
  "app.sessions": action(["composer"], "leader s"),
  "app.agents": action(["composer"], "leader a"),
  "app.new": action(["composer"], "leader n"),
  "app.config": action(["composer"], "leader c"),
  "app.model": action(["composer"], "leader m"),
  "app.cycle-mode": action(["composer"], "shift+tab"),
  "app.files": action(["composer"], "leader f"),
  "app.sidebar": action(["composer"], "leader b"),
  "app.tools": action(all, "leader o"),
  "app.quit": action(global, "ctrl+q"),
  "app.interrupt": action(global, "ctrl+c"),
  "app.cancel": action(global, "escape"),
  "app.scrollUp": action(["composer", "picker", "permission"], "pageup"),
  "app.scrollDown": action(["composer", "picker", "permission"], "pagedown"),
  "app.clear-attachments": action(["composer"]),
  "app.reconnect": action(["composer"]),
  "app.thoughts": action(["composer"]),
  "app.theme": action(["composer"], "leader t"),
  "app.earlier": action(["composer"]),
  "app.export": action(["composer"]),
  "app.paths": action(["composer"]),
  "app.usage": action(["composer"]),
  "composer.submit": action(["composer"], "enter"),
  "composer.newline": action(["composer"], "shift+enter"),
  "composer.complete": action(["composer"], "tab"),
  "composer.historyPrevious": action(["composer"], "up", "ctrl+p"),
  "composer.historyNext": action(["composer"], "down", "ctrl+n"),
  "picker.previous": action(["picker"], "up", "ctrl+p"),
  "picker.next": action(["picker"], "down", "ctrl+n"),
  "picker.confirm": action(["picker"], "enter"),
  "help.previous": action(["help"], "up", "ctrl+p"),
  "help.next": action(["help"], "down", "ctrl+n"),
  "help.pageUp": action(["help"], "pageup"),
  "help.pageDown": action(["help"], "pagedown"),
  "permission.previous": action(["permission"], "up", "ctrl+p"),
  "permission.next": action(["permission"], "down", "ctrl+n"),
  "permission.confirm": action(["permission"], "enter"),
  "form.decline": action(form, "ctrl+d"),
  "form.toggleJson": action(form, "ctrl+e"),
  "form.submitJson": action(["form.json"], "ctrl+enter"),
  "form.jsonNewline": action(["form.json"], "enter"),
  "form.previous": action(questions, "left"),
  "form.next": action(questions, "right"),
  "form.confirm": action(questions, "enter", "ctrl+enter"),
  "form.clear": action(questions, "ctrl+u"),
  "form.optionPrevious": action(["form.choice"], "up", "ctrl+p"),
  "form.optionNext": action(["form.choice"], "down", "ctrl+n"),
  "form.toggle": action(["form.choice"], "space"),
  "form.cursorLeft": action(["form.text"], "ctrl+b"),
  "form.cursorRight": action(["form.text"], "ctrl+f"),
  "form.cursorUp": action(["form.text", "form.json"], "ctrl+p"),
  "form.cursorDown": action(["form.text", "form.json"], "ctrl+n"),
  "form.newline": action(["form.text"], "shift+enter", "alt+enter"),
} satisfies Record<string, { contexts: KeyContext[]; keys: string[] }>;
export type KeyAction = keyof typeof keyActions;
/** Human-readable reference text, shared by the searchable shortcut window. */
export const keyDescriptions: Record<KeyAction, string> = {
  "app.commands": "Open command palette",
  "app.help": "Keyboard shortcuts",
  "app.sessions": "Switch session",
  "app.agents": "Choose agent / new session",
  "app.new": "New session",
  "app.config": "Model, mode and agent settings",
  "app.model": "Choose agent model",
  "app.cycle-mode": "Cycle agent mode",
  "app.files": "Attach a text file",
  "app.sidebar": "Toggle sidebar",
  "app.tools": "Expand / collapse tool details",
  "app.quit": "Quit",
  "app.interrupt": "Cancel while busy; otherwise quit",
  "app.cancel": "Close help / picker, cancel interaction / turn, clear notice",
  "app.scrollUp": "Scroll conversation up",
  "app.scrollDown": "Scroll conversation down",
  "app.clear-attachments": "Clear attachments",
  "app.reconnect": "Reconnect current session",
  "app.thoughts": "Show / hide reasoning",
  "app.theme": "Choose theme",
  "app.earlier": "Show earlier messages",
  "app.export": "Export transcript to Markdown",
  "app.paths": "Show configuration and data paths",
  "app.usage": "Show reported session usage",
  "composer.submit": "Send prompt",
  "composer.newline": "Insert newline",
  "composer.complete": "Complete command / attach file after @",
  "composer.historyPrevious": "Previous message or command at top of composer",
  "composer.historyNext": "Next message or command at bottom of composer",
  "picker.previous": "Previous choice",
  "picker.next": "Next choice",
  "picker.confirm": "Confirm choice",
  "help.previous": "Scroll shortcuts up",
  "help.next": "Scroll shortcuts down",
  "help.pageUp": "Page shortcuts up",
  "help.pageDown": "Page shortcuts down",
  "permission.previous": "Previous permission option",
  "permission.next": "Next permission option",
  "permission.confirm": "Confirm permission option",
  "form.decline": "Decline form",
  "form.toggleJson": "Switch questions / JSON",
  "form.submitJson": "Validate and submit JSON",
  "form.jsonNewline": "Insert JSON newline",
  "form.previous": "Previous question",
  "form.next": "Next question",
  "form.confirm": "Confirm answer and advance",
  "form.clear": "Skip optional answer / clear required answer",
  "form.optionPrevious": "Previous answer option",
  "form.optionNext": "Next answer option",
  "form.toggle": "Toggle checkbox",
  "form.cursorLeft": "Move text cursor left",
  "form.cursorRight": "Move text cursor right",
  "form.cursorUp": "Move text cursor up",
  "form.cursorDown": "Move text cursor down",
  "form.newline": "Insert answer newline",
};
export type KeyOverrides = Partial<Record<KeyAction, string[]>>;
export type KeyStroke = {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  super?: boolean;
  hyper?: boolean;
  baseCode?: number;
};
export type KeyBinding = KeyStroke[];

const aliases: Record<string, string> = {
  enter: "return",
  kpenter: "return",
  esc: "escape",
  pgup: "pageup",
  pgdn: "pagedown",
  pgdown: "pagedown",
  spacebar: "space",
  plus: "+",
  minus: "-",
};
const normalizeName = (name: string) => aliases[name.toLowerCase()] ?? name.toLowerCase();
const namedKeys = new Set([
  "return",
  "escape",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "up",
  "down",
  "left",
  "right",
  "pageup",
  "pagedown",
  "linefeed",
]);

export function parseKey(text: string): KeyStroke {
  const parts = text.toLowerCase().split("+");
  const name = normalizeName(parts.pop() ?? "");
  if (
    !(
      namedKeys.has(name) ||
      /^[a-z0-9\p{P}\p{S}]$/u.test(name) ||
      /^f([1-9]|1\d|2[0-4])$/.test(name)
    )
  ) {
    throw new Error(
      `Invalid key ${JSON.stringify(text)}. Use a key name such as enter, f1 or ctrl+p (plus for +).`,
    );
  }
  const key: KeyStroke = { name };
  for (const part of parts) {
    const modifier = part === "alt" || part === "meta" ? "meta" : part;
    if (
      modifier !== "ctrl" &&
      modifier !== "shift" &&
      modifier !== "meta" &&
      modifier !== "super"
    ) {
      throw new Error(`Unknown modifier ${JSON.stringify(part)} in ${JSON.stringify(text)}.`);
    }
    if (key[modifier]) throw new Error(`Repeated modifier in ${JSON.stringify(text)}.`);
    key[modifier] = true;
  }
  return key;
}

function signature(key: KeyStroke) {
  return `${!!key.ctrl}:${!!key.shift}:${!!key.meta}:${!!key.super}:${normalizeName(key.name)}`;
}

export function matchesKey(key: KeyStroke, binding: KeyStroke) {
  if (
    key.hyper ||
    !!key.ctrl !== !!binding.ctrl ||
    !!key.shift !== !!binding.shift ||
    !!key.meta !== !!binding.meta ||
    !!key.super !== !!binding.super
  )
    return false;
  return (
    normalizeName(key.name) === normalizeName(binding.name) ||
    (key.baseCode !== undefined &&
      normalizeName(String.fromCodePoint(key.baseCode)) === normalizeName(binding.name))
  );
}

export function formatKey(key: KeyStroke) {
  const names: Record<string, string> = {
    return: "Enter",
    escape: "Esc",
    pageup: "PgUp",
    pagedown: "PgDn",
    linefeed: "Linefeed",
    " ": "Space",
  };
  return [
    key.ctrl && "Ctrl",
    key.shift && "Shift",
    key.meta && "Alt",
    key.super && "Super",
    names[key.name] ?? key.name[0]!.toUpperCase() + key.name.slice(1),
  ]
    .filter(Boolean)
    .join("+");
}

export const defaultLeader = "ctrl+x";

/** A binding is one key or a two-key prefix sequence, separated by a space. */
export function parseBinding(
  text: string,
  leader: KeyStroke = parseKey(defaultLeader),
): KeyBinding {
  const parts = text.split(" ");
  if (parts.length < 1 || parts.length > 2 || parts.some(part => !part))
    throw new Error(
      `Invalid key sequence ${JSON.stringify(text)}. Use one key or two keys separated by a space.`,
    );
  if (parts[0]?.toLowerCase() === "leader") {
    if (parts.length !== 2)
      throw new Error(
        `Invalid key sequence ${JSON.stringify(text)}. Use leader followed by a key.`,
      );
    return [leader, parseKey(parts[1]!)];
  }
  return parts.map(parseKey);
}

export const formatBinding = (binding: KeyBinding) => binding.map(formatKey).join(" ");

// App commands are routed centrally; widget and immediate global actions only
// accept single keys so a configured sequence can never silently do nothing.
const sequenceActions = new Set<KeyAction>([
  "app.commands",
  "app.sessions",
  "app.agents",
  "app.new",
  "app.config",
  "app.model",
  "app.cycle-mode",
  "app.files",
  "app.sidebar",
  "app.tools",
  "app.clear-attachments",
  "app.reconnect",
  "app.thoughts",
  "app.theme",
  "app.earlier",
  "app.export",
  "app.paths",
  "app.usage",
]);

export function resolveKeybindings(overrides: KeyOverrides = {}, leader = defaultLeader) {
  const leaderKey = parseKey(leader);
  const resolved = {} as Record<KeyAction, KeyBinding[]>;
  const used = new Map<string, KeyAction>();
  const prefixes = new Map<string, KeyAction>();
  for (const id of Object.keys(overrides)) {
    if (!Object.hasOwn(keyActions, id))
      throw new Error(`Unknown keybinding action ${JSON.stringify(id)}.`);
  }
  for (const id of Object.keys(keyActions) as KeyAction[]) {
    const definition = keyActions[id];
    resolved[id] = [];
    for (const text of overrides[id] ?? definition.keys) {
      let binding: KeyBinding;
      try {
        binding = parseBinding(text, leaderKey);
      } catch (error) {
        throw new Error(`${id}: ${(error as Error).message}`);
      }
      if (binding.length === 2 && !sequenceActions.has(id))
        throw new Error(`${id}: two-key sequences are only supported for application commands.`);
      const signatures = binding.map(signature);
      if (resolved[id].some(existing => existing.map(signature).join(" ") === signatures.join(" ")))
        throw new Error(`${id}: duplicate binding ${JSON.stringify(text)}.`);
      for (const context of definition.contexts) {
        const slot = `${context}:${signatures.join(" ")}`;
        const previous = used.get(slot);
        if (previous)
          throw new Error(
            `Keybinding conflict: ${formatBinding(binding)} is assigned to ${previous} and ${id} in ${context}. Rebind or disable one of these actions.`,
          );
        used.set(slot, id);
        if (binding.length === 2) prefixes.set(`${context}:${signatures[0]}`, id);
      }
      resolved[id].push(binding);
    }
  }
  for (const [prefix, id] of prefixes) {
    const previous = used.get(prefix);
    if (previous)
      throw new Error(
        `Keybinding conflict: the prefix of ${id} is assigned to ${previous} as a single key. Rebind or disable one of these actions.`,
      );
  }
  return {
    bindings: resolved,
    matches: (id: KeyAction, key: KeyStroke) =>
      resolved[id].some(binding => binding.length === 1 && matchesKey(key, binding[0]!)),
    starts: (context: KeyContext, key: KeyStroke) =>
      (Object.keys(keyActions) as KeyAction[]).some(
        id =>
          keyActions[id].contexts.includes(context) &&
          resolved[id].some(binding => binding.length === 2 && matchesKey(key, binding[0]!)),
      ),
    sequence: (context: KeyContext, first: KeyStroke, second: KeyStroke): KeyAction | undefined =>
      (Object.keys(keyActions) as KeyAction[]).find(
        id =>
          keyActions[id].contexts.includes(context) &&
          resolved[id].some(
            binding =>
              binding.length === 2 &&
              matchesKey(first, binding[0]!) &&
              matchesKey(second, binding[1]!),
          ),
      ),
    label: (id: KeyAction) => resolved[id].map(formatBinding).join(" / "),
    hint: (id: KeyAction, description: string) =>
      resolved[id].length
        ? `${formatBinding(resolved[id][0]!)} ${description}`
        : `${description} (unbound)`,
  };
}
export type Keybindings = ReturnType<typeof resolveKeybindings>;
export const defaultKeybindings = resolveKeybindings();

export const keybindingsSchema = z
  .record(z.string(), z.array(z.string()))
  .transform(value => value as KeyOverrides);
