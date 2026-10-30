import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { defaultLeader, keybindingsSchema, parseKey, resolveKeybindings } from "./keybindings";
import { themeSettingsSchema, validateThemeSettings } from "./themes";

const agentSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});
export const configSchema = z
  .object({
    ...themeSettingsSchema.shape,
    leader: z.string().default(defaultLeader),
    keybindings: keybindingsSchema.optional(),
    defaultAgent: z.string().default("opencode"),
    agents: z.record(z.string(), agentSchema).default({
      opencode: { command: "opencode", args: ["acp"], env: {} },
      copilot: { command: "copilot", args: ["--acp", "--stdio"], env: {} },
    }),
  })
  .superRefine((config, ctx) => {
    validateThemeSettings(config, ctx);
    try {
      parseKey(config.leader);
    } catch (error) {
      ctx.addIssue({ code: "custom", path: ["leader"], message: (error as Error).message });
      return;
    }
    try {
      resolveKeybindings(config.keybindings, config.leader);
    } catch (error) {
      ctx.addIssue({ code: "custom", path: ["keybindings"], message: (error as Error).message });
    }
  });
export type AgentDefinition = z.infer<typeof agentSchema>;
export type Config = z.infer<typeof configSchema>;

export function appPaths(env = process.env) {
  return {
    config: join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "yksi", "config.json"),
    data: env.YKSI_DATA_DIR || join(env.XDG_DATA_HOME || join(homedir(), ".local/share"), "yksi"),
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
