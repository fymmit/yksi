import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { keybindingsSchema } from "./keybindings";
import { themeSettingsSchema, validateThemeSettings } from "./themes";

const agentSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});
export const configSchema = z
  .object({
    ...themeSettingsSchema.shape,
    keybindings: keybindingsSchema.optional(),
    defaultAgent: z.string().default("copilot"),
    agents: z.record(z.string(), agentSchema).default({
      copilot: { command: "copilot", args: ["--acp", "--stdio"], env: {} },
    }),
  })
  .superRefine(validateThemeSettings);
export type AgentDefinition = z.infer<typeof agentSchema>;
export type Config = z.infer<typeof configSchema>;

export function appPaths(env = process.env) {
  return {
    config: join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "acp-tui", "config.json"),
    data:
      env.ACP_TUI_DATA_DIR || join(env.XDG_DATA_HOME || join(homedir(), ".local/share"), "acp-tui"),
  };
}

export async function loadConfig(path = appPaths().config, explicit = false): Promise<Config> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    if (explicit) throw new Error(`Configuration not found: ${path}`);
    return configSchema.parse({});
  }
  const config = configSchema.parse(await file.json());
  if (!config.agents[config.defaultAgent])
    throw new Error(`Unknown defaultAgent: ${config.defaultAgent}`);
  return config;
}

export function demoAgent(): AgentDefinition {
  const compiled = resolve(import.meta.dir, "demo-agent.js");
  return {
    command: process.execPath,
    args: [existsSync(compiled) ? compiled : resolve(import.meta.dir, "demo-agent.ts")],
    env: {},
  };
}
