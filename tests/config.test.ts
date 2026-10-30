import { expect, test } from "bun:test";
import { configSchema, loadConfig } from "../src/config";

test("OpenCode is the default ACP agent and Copilot remains selectable", async () => {
  const config = configSchema.parse({});
  expect(config.defaultAgent).toBe("opencode");
  expect(config.agents.opencode).toEqual({ command: "opencode", args: ["acp"], env: {} });
  expect(config.agents.copilot).toEqual({
    command: "copilot",
    args: ["--acp", "--stdio"],
    env: {},
  });

  const missing = await loadConfig("/nonexistent-yksi-config-test.json");
  expect(missing.defaultAgent).toBe("opencode");
});

test("explicit agent configuration still replaces built-in choices", () => {
  const config = configSchema.parse({
    defaultAgent: "gemini",
    agents: { gemini: { command: "gemini", args: ["--acp"] } },
  });
  expect(config.agents).toEqual({
    gemini: { command: "gemini", args: ["--acp"], env: {} },
  });
});
