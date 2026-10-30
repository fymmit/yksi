import { z } from "zod";

export type KeyContext = "composer" | "picker" | "permission" | "form.text" | "form.choice" | "form.json";
const all: KeyContext[] = ["composer", "picker", "permission", "form.text", "form.choice", "form.json"];
const form: KeyContext[] = ["form.text", "form.choice", "form.json"];
const questions: KeyContext[] = ["form.text", "form.choice"];
const action = (contexts: KeyContext[], ...keys: string[]) => ({ contexts, keys });

/** Stable configuration IDs. Contexts describe where actions can consume a key. */
export const keyActions = {
  "app.commands": action(["composer"], "ctrl+p"),
  "app.sessions": action(["composer"], "ctrl+s"),
  "app.agents": action(["composer"], "ctrl+a"),
  "app.new": action(["composer"], "ctrl+n"),
  "app.config": action(["composer"], "ctrl+m"),
  "app.files": action(["composer"], "ctrl+f"),
  "app.sidebar": action(["composer"], "ctrl+b"),
  "app.tools": action(all, "ctrl+o"),
  "app.quit": action(all, "ctrl+q"),
  "app.interrupt": action(all, "ctrl+c"),
  "app.cancel": action(all, "escape"),
  "app.scrollUp": action(["composer", "picker", "permission"], "pageup"),
  "app.scrollDown": action(["composer", "picker", "permission"], "pagedown"),
  "app.clear-attachments": action(["composer"]),
  "app.reconnect": action(["composer"]),
  "app.thoughts": action(["composer"]),
  "app.theme": action(["composer"]),
  "app.earlier": action(["composer"]),
  "app.export": action(["composer"]),
  "app.paths": action(["composer"]),
  "app.usage": action(["composer"]),
  "composer.submit": action(["composer"], "enter"),
  "composer.newline": action(["composer"], "shift+enter", "alt+enter"),
  "composer.complete": action(["composer"], "tab"),
  "composer.historyPrevious": action(["composer"], "ctrl+up"),
  "composer.historyNext": action(["composer"], "ctrl+down"),
  "picker.previous": action(["picker"], "up"),
  "picker.next": action(["picker"], "down"),
  "picker.confirm": action(["picker"], "enter"),
  "permission.previous": action(["permission"], "up"),
  "permission.next": action(["permission"], "down"),
  "permission.confirm": action(["permission"], "enter"),
  "form.decline": action(form, "ctrl+d"),
  "form.toggleJson": action(form, "ctrl+e"),
  "form.submitJson": action(["form.json"], "ctrl+enter"),
  "form.jsonNewline": action(["form.json"], "enter"),
  "form.previous": action(questions, "left"),
  "form.next": action(questions, "right"),
  "form.confirm": action(questions, "enter", "ctrl+enter"),
  "form.clear": action(questions, "ctrl+u"),
  "form.optionPrevious": action(["form.choice"], "up"),
  "form.optionNext": action(["form.choice"], "down"),
  "form.toggle": action(["form.choice"], "space"),
  "form.cursorLeft": action(["form.text"], "ctrl+b"),
  "form.cursorRight": action(["form.text"], "ctrl+f"),
  "form.newline": action(["form.text"], "shift+enter", "alt+enter"),
} satisfies Record<string, { contexts: KeyContext[]; keys: string[] }>;
export type KeyAction = keyof typeof keyActions;
export type KeyOverrides = Partial<Record<KeyAction, string[]>>;
export type KeyStroke = { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean; super?: boolean; hyper?: boolean; baseCode?: number };

const aliases: Record<string, string> = { enter: "return", kpenter: "return", esc: "escape", pgup: "pageup", pgdn: "pagedown", pgdown: "pagedown", spacebar: "space", plus: "+", minus: "-" };
const normalizeName = (name: string) => aliases[name.toLowerCase()] ?? name.toLowerCase();
const namedKeys = new Set(["return", "escape", "tab", "space", "backspace", "delete", "insert", "home", "end", "up", "down", "left", "right", "pageup", "pagedown", "linefeed"]);

export function parseKey(text: string): KeyStroke {
  const parts = text.toLowerCase().split("+");
  const name = normalizeName(parts.pop() ?? "");
  if (!(namedKeys.has(name) || /^[a-z0-9\p{P}\p{S}]$/u.test(name) || /^f([1-9]|1\d|2[0-4])$/.test(name))) {
    throw new Error(`Invalid key ${JSON.stringify(text)}. Use a key name such as enter, f1 or ctrl+p (plus for +).`);
  }
  const key: KeyStroke = { name };
  for (const part of parts) {
    const modifier = part === "alt" || part === "meta" ? "meta" : part;
    if (modifier !== "ctrl" && modifier !== "shift" && modifier !== "meta" && modifier !== "super") {
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
  if (key.hyper || !!key.ctrl !== !!binding.ctrl || !!key.shift !== !!binding.shift || !!key.meta !== !!binding.meta || !!key.super !== !!binding.super) return false;
  return normalizeName(key.name) === normalizeName(binding.name) || (key.baseCode !== undefined && normalizeName(String.fromCodePoint(key.baseCode)) === normalizeName(binding.name));
}

export function formatKey(key: KeyStroke) {
  const names: Record<string, string> = { return: "Enter", escape: "Esc", pageup: "PgUp", pagedown: "PgDn", linefeed: "Linefeed", " ": "Space" };
  return [key.ctrl && "Ctrl", key.shift && "Shift", key.meta && "Alt", key.super && "Super", names[key.name] ?? key.name[0]!.toUpperCase() + key.name.slice(1)].filter(Boolean).join("+");
}

export function resolveKeybindings(overrides: KeyOverrides = {}) {
  const resolved = {} as Record<KeyAction, KeyStroke[]>;
  const used = new Map<string, KeyAction>();
  for (const id of Object.keys(overrides)) {
    if (!Object.hasOwn(keyActions, id)) throw new Error(`Unknown keybinding action ${JSON.stringify(id)}.`);
  }
  for (const id of Object.keys(keyActions) as KeyAction[]) {
    const definition = keyActions[id];
    resolved[id] = [];
    for (const text of overrides[id] ?? definition.keys) {
      let key: KeyStroke;
      try { key = parseKey(text); } catch (error) { throw new Error(`${id}: ${(error as Error).message}`); }
      if (resolved[id].some(existing => signature(existing) === signature(key))) throw new Error(`${id}: duplicate binding ${JSON.stringify(text)}.`);
      for (const context of definition.contexts) {
        const slot = `${context}:${signature(key)}`;
        const previous = used.get(slot);
        if (previous) throw new Error(`Keybinding conflict: ${formatKey(key)} is assigned to ${previous} and ${id} in ${context}. Rebind or disable one of these actions.`);
        used.set(slot, id);
      }
      resolved[id].push(key);
    }
  }
  return {
    bindings: resolved,
    matches: (id: KeyAction, key: KeyStroke) => resolved[id].some(binding => matchesKey(key, binding)),
    label: (id: KeyAction) => resolved[id].map(formatKey).join(" / "),
    hint: (id: KeyAction, description: string) => resolved[id].length ? `${formatKey(resolved[id][0]!)} ${description}` : `${description} (unbound)`,
  };
}
export type Keybindings = ReturnType<typeof resolveKeybindings>;
export const defaultKeybindings = resolveKeybindings();

export const keybindingsSchema = z.record(z.string(), z.array(z.string())).superRefine((value, ctx) => {
  try { resolveKeybindings(value); }
  catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
}).transform(value => value as KeyOverrides);
