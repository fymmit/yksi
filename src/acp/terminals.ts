import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute } from "node:path";
import type * as acp from "@agentclientprotocol/sdk";

type Terminal = {
  process: ChildProcessWithoutNullStreams;
  sessionId: string;
  output: string;
  truncated: boolean;
  exitStatus?: acp.TerminalExitStatus;
  exited: Promise<acp.TerminalExitStatus>;
};

export class Terminals {
  private terminals = new Map<string, Terminal>();
  constructor(private cwd: string, private onOutput: (id: string, output: string) => void) {}

  create(params: acp.CreateTerminalRequest): acp.CreateTerminalResponse {
    if (params.cwd && !isAbsolute(params.cwd)) throw new Error("ACP working directories must be absolute");
    const child = spawn(params.command, params.args ?? [], {
      cwd: params.cwd ?? this.cwd,
      env: { ...process.env, ...Object.fromEntries((params.env ?? []).map(v => [v.name, v.value])) },
      stdio: "pipe", detached: process.platform !== "win32",
    });
    const id = crypto.randomUUID();
    const limit = Math.max(0, Math.min(params.outputByteLimit ?? 128 * 1024, 1024 * 1024));
    let finish!: (status: acp.TerminalExitStatus) => void;
    const terminal: Terminal = { process: child, sessionId: params.sessionId, output: "", truncated: false, exited: new Promise(resolve => { finish = resolve; }) };
    const append = (text: string) => {
      const bytes = Buffer.from(terminal.output + text);
      let start = Math.max(0, bytes.length - limit);
      if (start) {
        terminal.truncated = true;
        while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
      }
      terminal.output = bytes.subarray(start).toString("utf8");
      this.onOutput(id, terminal.output);
    };
    child.stdout.setEncoding("utf8").on("data", append);
    child.stderr.setEncoding("utf8").on("data", append);
    child.stdin.end();
    child.on("error", error => { append(error.message); terminal.exitStatus = { exitCode: 1 }; finish(terminal.exitStatus); });
    child.on("close", (code, signal) => {
      terminal.exitStatus ??= { exitCode: code, signal };
      finish(terminal.exitStatus);
      this.onOutput(id, terminal.output);
    });
    this.terminals.set(id, terminal);
    return { terminalId: id };
  }
  private get(params: { sessionId: string; terminalId: string }) {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal || terminal.sessionId !== params.sessionId) throw new Error("Unknown terminal for session");
    return terminal;
  }
  output(params: acp.TerminalOutputRequest): acp.TerminalOutputResponse {
    const { output, truncated, exitStatus } = this.get(params);
    return { output, truncated, exitStatus };
  }
  wait(params: acp.WaitForTerminalExitRequest) { return this.get(params).exited; }
  kill(params: acp.KillTerminalRequest) { stopProcess(this.get(params).process); return {}; }
  release(params: acp.ReleaseTerminalRequest) {
    this.kill(params);
    this.terminals.delete(params.terminalId);
    return {};
  }
  dispose() {
    for (const terminal of this.terminals.values()) stopProcess(terminal.process);
    this.terminals.clear();
  }
}

export function stopProcess(child: ChildProcessWithoutNullStreams) {
  if (!child.pid) return;
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32") process.kill(-child.pid!, signal);
      else if (child.exitCode === null) child.kill(signal);
    } catch { /* The process group has already exited. */ }
  };
  kill("SIGTERM");
  const timer = setTimeout(() => kill("SIGKILL"), 1000);
  timer.unref();
}
