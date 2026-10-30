import { expect, test } from "bun:test";
import { configSchema, loadConfig } from "../src/config";
import {
  defaultKeybindings,
  formatKey,
  keyActions,
  parseKey,
  resolveKeybindings,
} from "../src/keybindings";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("keybindings inherit defaults, replace alternatives and disable shortcuts", () => {
  const keys = resolveKeybindings({ "app.commands": ["alt+p", "f2"], "app.sidebar": [] });
  expect(keys.label("app.commands")).toBe("Alt+P / F2");
  expect(keys.hint("app.commands", "commands")).toBe("Alt+P commands");
  expect(keys.matches("app.commands", { name: "p", ctrl: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "f2" })).toBe(true);
  expect(keys.label("app.sidebar")).toBe("");
  expect(keys.hint("app.sidebar", "sidebar")).toBe("sidebar (unbound)");
  expect(keys.label("composer.submit")).toBe("Enter");
  expect(defaultKeybindings.label("app.commands")).toBe("Ctrl+X P");
  expect(defaultKeybindings.label("app.theme")).toBe("Ctrl+X T");
  expect(keyActions["app.commands"].keys).toEqual(["leader p"]);
  expect(defaultKeybindings.label("composer.historyPrevious")).toBe("Up / Ctrl+P");
  expect(defaultKeybindings.starts("composer", { name: "x", ctrl: true })).toBe(true);
  expect(defaultKeybindings.sequence("composer", { name: "x", ctrl: true }, { name: "p" })).toBe(
    "app.commands",
  );
  expect(defaultKeybindings.sequence("picker", { name: "x", ctrl: true }, { name: "o" })).toBe(
    "app.tools",
  );
});

test("configured leader changes symbolic defaults without changing literal bindings", () => {
  const keys = resolveKeybindings({ "app.commands": ["leader p", "ctrl+x z"] }, "ctrl+g");
  expect(keys.label("app.commands")).toBe("Ctrl+G P / Ctrl+X Z");
  expect(keys.hint("app.new", "new")).toBe("Ctrl+G N new");
  expect(keys.starts("composer", { name: "x", ctrl: true })).toBe(true);
  expect(keys.sequence("composer", { name: "g", ctrl: true }, { name: "p" })).toBe("app.commands");
  expect(keys.sequence("composer", { name: "x", ctrl: true }, { name: "z" })).toBe("app.commands");
  expect(keys.sequence("composer", { name: "x", ctrl: true }, { name: "p" })).toBeUndefined();
});

test("key syntax normalizes aliases and matches modifiers exactly, including physical keys", () => {
  expect(formatKey(parseKey("SHIFT+Meta+Return"))).toBe("Shift+Alt+Enter");
  expect(formatKey(parseKey("ctrl+plus"))).toBe("Ctrl++");
  const keys = resolveKeybindings({ "app.commands": ["ctrl+shift+p", "super+pgup"] });
  expect(keys.matches("app.commands", { name: "P", ctrl: true, shift: true })).toBe(true);
  expect(keys.matches("app.commands", { name: "p", ctrl: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "p", ctrl: true, shift: true, meta: true })).toBe(
    false,
  );
  expect(keys.matches("app.commands", { name: "p", ctrl: true, shift: true, hyper: true })).toBe(
    false,
  );
  expect(
    keys.matches("app.commands", { name: "other", baseCode: 112, ctrl: true, shift: true }),
  ).toBe(true);
  expect(keys.matches("app.commands", { name: "pageup", super: true })).toBe(true);
  expect(defaultKeybindings.matches("composer.submit", { name: "kpenter" })).toBe(true);
});

test("configuration rejects malformed keys, unknown actions and overlapping contexts", () => {
  for (const text of [
    "",
    "ctrl+",
    "ctrl+ctrl+p",
    "alt+meta+p",
    "ctrl+x n",
    "leader+n",
    "ctrl+unknown",
    "f25",
  ]) {
    expect(() => configSchema.parse({ keybindings: { "app.commands": [text] } })).toThrow();
  }
  expect(() => configSchema.parse({ keybindings: { "app.command": ["f1"] } })).toThrow(
    "Unknown keybinding action",
  );
  expect(() => configSchema.parse({ keybindings: { "app.commands": "f1" } })).toThrow();
  expect(() => resolveKeybindings({ "app.commands": ["f2", "F2"] })).toThrow("duplicate");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x s"] })).toThrow("app.sessions");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x"] })).toThrow("prefix");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x p q"] })).toThrow("sequence");
  expect(() => resolveKeybindings({ "app.commands": ["leader"] })).toThrow(
    "leader followed by a key",
  );
  expect(() => resolveKeybindings({ "app.commands": ["leader+n"] })).toThrow();
  expect(() => resolveKeybindings({ "app.commands": ["leader n"] })).toThrow("app.new");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x  p"] })).toThrow("sequence");
  expect(() => resolveKeybindings({ "picker.next": ["ctrl+x n"] })).toThrow("only supported");
  expect(() => resolveKeybindings({ "app.quit": ["ctrl+x q"] })).toThrow("only supported");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x p", "ctrl+x P"] })).toThrow(
    "duplicate",
  );
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+x p"], "app.new": ["ctrl+x"] })).toThrow(
    "prefix",
  );
  expect(() =>
    resolveKeybindings({ "app.commands": ["alt+p"], "app.new": ["ctrl+x p"] }),
  ).not.toThrow();
  expect(() => resolveKeybindings({ "app.commands": ["leader p", "ctrl+g p"] }, "ctrl+g")).toThrow(
    "duplicate",
  );
  expect(() => configSchema.parse({ leader: "ctrl+x p" })).toThrow("Invalid key");
  expect(() => configSchema.parse({ leader: "leader" })).toThrow("Invalid key");
  expect(() =>
    configSchema.parse({ leader: "ctrl+g", keybindings: { "app.commands": ["ctrl+x"] } }),
  ).not.toThrow();
  expect(() =>
    configSchema.parse({ leader: "ctrl+g", keybindings: { "app.commands": ["ctrl+x p"] } }),
  ).not.toThrow();
  expect(() =>
    configSchema.parse({ leader: "ctrl+g", keybindings: { "app.commands": ["ctrl+g"] } }),
  ).toThrow("prefix");
  expect(() => resolveKeybindings({ "app.quit": ["enter"] })).toThrow("composer.submit");
  expect(() => resolveKeybindings({ "form.confirm": ["ctrl+e"] })).toThrow("form.toggleJson");
  expect(() => resolveKeybindings({ "app.tools": ["ctrl+b"] })).toThrow("form.cursorLeft");
  expect(() =>
    resolveKeybindings({ "app.commands": ["ctrl+s"], "app.sessions": [] }),
  ).not.toThrow();
  expect(() =>
    resolveKeybindings({
      "app.commands": ["alt+p"],
      "form.toggleJson": ["alt+p"],
      "picker.confirm": ["alt+p"],
    }),
  ).not.toThrow();
});

test("explicit configuration loads keybindings and reports invalid overrides", async () => {
  const directory = await mkdtemp(join(tmpdir(), "acp-keybindings-"));
  const path = join(directory, "config.json");
  try {
    await Bun.write(
      path,
      JSON.stringify({
        keybindings: { "composer.submit": ["ctrl+enter"], "composer.newline": ["enter"] },
      }),
    );
    const config = await loadConfig(path, true);
    expect(resolveKeybindings(config.keybindings).label("composer.submit")).toBe("Ctrl+Enter");
    await Bun.write(
      path,
      JSON.stringify({ leader: "ctrl+g", keybindings: { "app.theme": ["leader t"] } }),
    );
    const updated = await loadConfig(path, true);
    expect(updated.leader).toBe("ctrl+g");
    expect(resolveKeybindings(updated.keybindings, updated.leader).label("app.theme")).toBe(
      "Ctrl+G T",
    );
    await Bun.write(path, JSON.stringify({ keybindings: { "composer.submit": ["ctrl+p"] } }));
    await expect(loadConfig(path, true)).rejects.toThrow("Keybinding conflict");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
