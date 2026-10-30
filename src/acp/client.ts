import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentDefinition } from "../config";
import { readTextFile, writeTextFile } from "./files";
import { stopProcess, Terminals } from "./terminals";

export type ClientEvents = {
  update: (notification: acp.SessionNotification) => void;
  permission: (
    params: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ) => Promise<acp.RequestPermissionResponse>;
  question: (
    params: acp.CreateElicitationRequest,
    signal: AbortSignal,
  ) => Promise<acp.CreateElicitationResponse>;
  terminal: (id: string, output: string) => void;
  elicitationComplete?: (id: string) => void;
  disconnected: (message: string) => void;
};

export class AgentClient {
  private child?: ChildProcessWithoutNullStreams;
  private connection?: acp.ClientConnection;
  private terminals: Terminals;
  private disposed = false;
  private failed = false;
  info?: acp.InitializeResponse;

  constructor(
    private definition: AgentDefinition,
    private cwd: string,
    private events: ClientEvents,
    private logPath?: string,
  ) {
    this.terminals = new Terminals(cwd, events.terminal);
  }
  async connect() {
    const child = (this.child = spawn(this.definition.command, this.definition.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.definition.env },
      stdio: "pipe",
      detached: process.platform !== "win32",
    }));
    // Never inherit agent stderr: it would overwrite the alternate-screen UI.
    if (this.logPath) mkdirSync(dirname(this.logPath), { recursive: true, mode: 0o700 });
    child.stderr.on("data", chunk => {
      if (this.logPath) {
        try {
          appendFileSync(this.logPath, chunk, { mode: 0o600 });
        } catch {
          /* Diagnostics must not break a turn. */
        }
      }
    });
    const fail = (message: string) => {
      if (this.disposed || this.failed) return;
      this.failed = true;
      this.connection?.close(new Error(message));
      this.terminals.dispose();
      stopProcess(child);
      this.events.disconnected(message);
    };
    child.on("error", error =>
      fail(`Could not launch ${this.definition.command}: ${error.message}`),
    );
    child.on("exit", (code, signal) =>
      fail(`Agent exited (${signal ?? code ?? "unknown"}). Reconnect from the command palette.`),
    );
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    );
    this.connection = acp
      .client({ name: "acp-tui" })
      .onNotification(acp.methods.client.session.update, ctx => this.events.update(ctx.params))
      .onNotification(acp.methods.client.elicitation.complete, ctx =>
        this.events.elicitationComplete?.(ctx.params.elicitationId),
      )
      .onRequest(acp.methods.client.session.requestPermission, ctx =>
        this.events.permission(ctx.params, ctx.signal),
      )
      .onRequest(acp.methods.client.elicitation.create, ctx =>
        this.events.question(ctx.params, ctx.signal),
      )
      .onRequest(acp.methods.client.fs.readTextFile, ctx => readTextFile(ctx.params))
      .onRequest(acp.methods.client.fs.writeTextFile, ctx => writeTextFile(ctx.params))
      .onRequest(acp.methods.client.terminal.create, ctx => this.terminals.create(ctx.params))
      .onRequest(acp.methods.client.terminal.output, ctx => this.terminals.output(ctx.params))
      .onRequest(acp.methods.client.terminal.waitForExit, ctx => this.terminals.wait(ctx.params))
      .onRequest(acp.methods.client.terminal.kill, ctx => this.terminals.kill(ctx.params))
      .onRequest(acp.methods.client.terminal.release, ctx => this.terminals.release(ctx.params))
      .connect(stream);
    void this.connection.closed.then(() => {
      if (!this.disposed) fail("Agent connection closed. Reconnect from the command palette.");
    });
    this.info = await this.withTimeout(
      this.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: { name: "acp-tui", version: "0.1.0" },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          elicitation: { form: {}, url: {} },
          session: { notices: {}, configOptions: { boolean: {} } },
        },
      }),
    );
    if (this.info.protocolVersion !== acp.PROTOCOL_VERSION) {
      this.dispose();
      throw new Error(`Unsupported ACP protocol version: ${this.info.protocolVersion}`);
    }
    return this.info;
  }
  get agent() {
    if (!this.connection || this.connection.signal.aborted)
      throw new Error("Agent is not connected");
    return this.connection.agent;
  }
  async withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const message = "Agent request timed out. Reconnect to try again.";
            this.dispose();
            this.events.disconnected(message);
            reject(new Error(message));
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.connection?.close();
    this.terminals.dispose();
    if (this.child) stopProcess(this.child);
  }
}
