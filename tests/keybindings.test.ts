import { expect, test } from "bun:test";
import { configSchema, loadConfig } from "../src/config";
import { defaultKeybindings, formatKey, parseKey, resolveKeybindings } from "../src/keybindings";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("keybindings inherit defaults, replace alternatives and disable shortcuts", () => {
  const keys = resolveKeybindings({ "app.commands": ["alt+p", "f1"], "app.sidebar": [] });
  expect(keys.label("app.commands")).toBe("Alt+P / F1");
  expect(keys.hint("app.commands", "commands")).toBe("Alt+P commands");
  expect(keys.matches("app.commands", { name: "p", ctrl: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "f1" })).toBe(true);
  expect(keys.label("app.sidebar")).toBe("");
  expect(keys.hint("app.sidebar", "sidebar")).toBe("sidebar (unbound)");
  expect(keys.label("composer.submit")).toBe("Enter");
  expect(defaultKeybindings.label("app.commands")).toBe("Ctrl+P");
});

test("key syntax normalizes aliases and matches modifiers exactly, including physical keys", () => {
  expect(formatKey(parseKey("SHIFT+Meta+Return"))).toBe("Shift+Alt+Enter");
  expect(formatKey(parseKey("ctrl+plus"))).toBe("Ctrl++");
  const keys = resolveKeybindings({ "app.commands": ["ctrl+shift+p", "super+pgup"] });
  expect(keys.matches("app.commands", { name: "P", ctrl: true, shift: true })).toBe(true);
  expect(keys.matches("app.commands", { name: "p", ctrl: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "p", ctrl: true, shift: true, meta: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "p", ctrl: true, shift: true, hyper: true })).toBe(false);
  expect(keys.matches("app.commands", { name: "other", baseCode: 112, ctrl: true, shift: true })).toBe(true);
  expect(keys.matches("app.commands", { name: "pageup", super: true })).toBe(true);
  expect(defaultKeybindings.matches("composer.submit", { name: "kpenter" })).toBe(true);
});

test("configuration rejects malformed keys, unknown actions and overlapping contexts", () => {
  for (const text of ["", "ctrl+", "ctrl+ctrl+p", "alt+meta+p", "ctrl+x n", "leader+n", "ctrl+unknown", "f25"]) {
    expect(() => configSchema.parse({ keybindings: { "app.commands": [text] } })).toThrow();
  }
  expect(() => configSchema.parse({ keybindings: { "app.command": ["f1"] } })).toThrow("Unknown keybinding action");
  expect(() => configSchema.parse({ keybindings: { "app.commands": "f1" } })).toThrow();
  expect(() => resolveKeybindings({ "app.commands": ["f1", "F1"] })).toThrow("duplicate");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+s"] })).toThrow("app.sessions");
  expect(() => resolveKeybindings({ "app.quit": ["enter"] })).toThrow("composer.submit");
  expect(() => resolveKeybindings({ "form.confirm": ["ctrl+e"] })).toThrow("form.toggleJson");
  expect(() => resolveKeybindings({ "app.tools": ["ctrl+b"] })).toThrow("app.sidebar");
  expect(() => resolveKeybindings({ "app.commands": ["ctrl+s"], "app.sessions": [] })).not.toThrow();
  expect(() => resolveKeybindings({ "app.commands": ["alt+p"], "form.toggleJson": ["alt+p"], "picker.confirm": ["alt+p"] })).not.toThrow();
});

test("explicit configuration loads keybindings and reports invalid overrides", async () => {
  const directory = await mkdtemp(join(tmpdir(), "acp-keybindings-"));
  const path = join(directory, "config.json");
  try {
    await Bun.write(path, JSON.stringify({ keybindings: { "composer.submit": ["ctrl+enter"], "composer.newline": ["enter"] } }));
    const config = await loadConfig(path, true);
    expect(resolveKeybindings(config.keybindings).label("composer.submit")).toBe("Ctrl+Enter");
    await Bun.write(path, JSON.stringify({ keybindings: { "composer.submit": ["ctrl+p"] } }));
    await expect(loadConfig(path, true)).rejects.toThrow("Keybinding conflict");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
