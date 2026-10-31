#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { appPaths, demoAgent, loadConfig } from "./config";
import { Storage } from "./storage";
import { Controller } from "./controller";
import { App } from "./ui/app";
import { defaultKeybindings } from "./keybindings";
import { cleanup } from "./cleanup";

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      demo: { type: "boolean" },
      agent: { type: "string", short: "a" },
      config: { type: "string" },
      cwd: { type: "string" },
    },
  });
  if (values.help) {
    console.log(`yksi — an agent-agnostic AI coding TUI

Usage: yksi [directory] [options]

  --agent, -a NAME  Select a configured ACP agent (default: opencode)
  --demo           Use the offline demonstration agent
  --config PATH    Read an explicit configuration file
  --cwd PATH       Set the project directory
  --help, -h       Show this help
  --version, -v    Show version

Configuration: ${appPaths().config}
Data:          ${appPaths().data}

OpenCode: install the OpenCode CLI; choose an available model in OpenCode.
Copilot CLI is also built in; install and sign in to use --agent copilot.
Default keyboard: ${defaultKeybindings.hint("app.commands", "commands")} · ${defaultKeybindings.hint("app.sessions", "sessions")} · ${defaultKeybindings.hint("app.agents", "agents")} · ${defaultKeybindings.hint("app.cancel", "cancel")}
Customize shortcuts with keybindings in your configuration file.`);
    return;
  }
  if (values.version) {
    console.log("0.1.0");
    return;
  }
  if (positionals.length > 1) throw new Error("Expected at most one project directory.");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("yksi requires an interactive terminal. Use --help for usage.");
  const cwd = await realpath(resolve(values.cwd ?? positionals[0] ?? process.cwd()));
  if (!(await stat(cwd)).isDirectory()) throw new Error(`Not a directory: ${cwd}`);
  const config = await loadConfig(values.config, !!values.config);
  if (values.demo) config.agents.demo = demoAgent();
  const agent = values.demo ? "demo" : (values.agent ?? config.defaultAgent);
  if (!config.agents[agent])
    throw new Error(
      `Unknown agent: ${agent}. Configure it in ${values.config ?? appPaths().config}`,
    );
  const storage = new Storage(join(appPaths().data, "history.sqlite"));
  const controller = new Controller(
    config,
    storage,
    cwd,
    agent,
    join(appPaths().data, "agent.log"),
  );
  let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined;
  let quitting = false;
  const quit = () => {
    if (quitting) return;
    quitting = true;
    try {
      cleanup(
        () => controller.dispose(),
        () => storage.close(),
        () => renderer?.destroy(),
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  };
  process.once("SIGTERM", quit);
  process.once("SIGINT", quit);
  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 30,
      useMouse: true,
      screenMode: "alternate-screen",
    });
    if (quitting) {
      renderer.destroy();
      return;
    }
    await render(() => <App controller={controller} quit={quit} />, renderer);
    await renderer.closed;
  } finally {
    quit();
    process.off("SIGTERM", quit);
    process.off("SIGINT", quit);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
