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
const action = (description: string, contexts: KeyContext[], ...keys: string[]) => ({
  description,
  contexts,
  keys,
  sequence: false,
});
const command = (description: string, contexts: KeyContext[], ...keys: string[]) => ({
  ...action(description, contexts, ...keys),
  sequence: true,
});

/** Stable configuration IDs. Contexts describe where actions can consume a key. */
export const keyActions = {
  "app.commands": command("Open command palette", ["composer"], "leader p"),
  "app.help": action("Keyboard shortcuts", global, "f1"),
  "app.sessions": command("Switch session", ["composer"], "leader s"),
  "app.agents": command("Choose agent / new session", ["composer"], "leader a"),
  "app.new": command("New session", ["composer"], "leader n"),
  "app.config": command("Model, mode and agent settings", ["composer"], "leader c"),
  "app.model": command("Choose agent model", ["composer"], "leader m"),
  "app.cycle-mode": command("Cycle agent mode", ["composer"], "shift+tab"),
  "app.files": command("Attach a text file", ["composer"], "leader f"),
  "app.sidebar": command("Toggle sidebar", ["composer"], "leader b"),
  "app.tools": command("Expand / collapse tool details", all, "leader o"),
  "app.quit": action("Quit", global, "ctrl+q"),
  "app.interrupt": action("Cancel while busy; otherwise quit", global, "ctrl+c"),
  "app.cancel": action(
    "Close help / picker, cancel interaction / turn, clear notice",
    global,
    "escape",
  ),
  "app.scrollUp": action("Scroll conversation up", ["composer", "picker", "permission"], "pageup"),
  "app.scrollDown": action(
    "Scroll conversation down",
    ["composer", "picker", "permission"],
    "pagedown",
  ),
  "app.clear-attachments": command("Clear attachments", ["composer"]),
  "app.reconnect": command("Reconnect current session", ["composer"]),
  "app.thoughts": command("Show / hide reasoning", ["composer"]),
  "app.theme": command("Choose theme", ["composer"], "leader t"),
  "app.earlier": command("Show earlier messages", ["composer"]),
  "app.export": command("Export transcript to Markdown", ["composer"]),
  "app.paths": command("Show configuration and data paths", ["composer"]),
  "app.usage": command("Show reported session usage", ["composer"]),
  "composer.submit": action("Send prompt", ["composer"], "enter"),
  "composer.newline": action("Insert newline", ["composer"], "shift+enter"),
  "composer.complete": action("Complete command / attach file after @", ["composer"], "tab"),
  "composer.historyPrevious": action(
    "Previous message or command at top of composer",
    ["composer"],
    "up",
    "ctrl+p",
  ),
  "composer.historyNext": action(
    "Next message or command at bottom of composer",
    ["composer"],
    "down",
    "ctrl+n",
  ),
  "picker.previous": action("Previous choice", ["picker"], "up", "ctrl+p"),
  "picker.next": action("Next choice", ["picker"], "down", "ctrl+n"),
  "picker.confirm": action("Confirm choice", ["picker"], "enter"),
  "help.previous": action("Scroll shortcuts up", ["help"], "up", "ctrl+p"),
  "help.next": action("Scroll shortcuts down", ["help"], "down", "ctrl+n"),
  "help.pageUp": action("Page shortcuts up", ["help"], "pageup"),
  "help.pageDown": action("Page shortcuts down", ["help"], "pagedown"),
  "permission.previous": action("Previous permission option", ["permission"], "up", "ctrl+p"),
  "permission.next": action("Next permission option", ["permission"], "down", "ctrl+n"),
  "permission.confirm": action("Confirm permission option", ["permission"], "enter"),
  "form.decline": action("Decline form", form, "ctrl+d"),
  "form.toggleJson": action("Switch questions / JSON", form, "ctrl+e"),
  "form.submitJson": action("Validate and submit JSON", ["form.json"], "ctrl+enter"),
  "form.jsonNewline": action("Insert JSON newline", ["form.json"], "enter"),
  "form.previous": action("Previous question", questions, "left"),
  "form.next": action("Next question", questions, "right"),
  "form.confirm": action("Confirm answer and advance", questions, "enter", "ctrl+enter"),
  "form.clear": action("Skip optional answer / clear required answer", questions, "ctrl+u"),
  "form.optionPrevious": action("Previous answer option", ["form.choice"], "up", "ctrl+p"),
  "form.optionNext": action("Next answer option", ["form.choice"], "down", "ctrl+n"),
  "form.toggle": action("Toggle checkbox", ["form.choice"], "space"),
  "form.cursorLeft": action("Move text cursor left", ["form.text"], "ctrl+b"),
  "form.cursorRight": action("Move text cursor right", ["form.text"], "ctrl+f"),
  "form.cursorUp": action("Move text cursor up", ["form.text", "form.json"], "ctrl+p"),
  "form.cursorDown": action("Move text cursor down", ["form.text", "form.json"], "ctrl+n"),
  "form.newline": action("Insert answer newline", ["form.text"], "shift+enter", "alt+enter"),
};
export type KeyAction = keyof typeof keyActions;
/** Human-readable reference text, shared by the searchable shortcut window. */
export const keyDescriptions = Object.fromEntries(
  Object.entries(keyActions).map(([id, action]) => [id, action.description]),
) as Record<KeyAction, string>;
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
      if (binding.length === 2 && !definition.sequence)
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
