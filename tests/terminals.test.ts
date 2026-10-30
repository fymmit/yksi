import { expect, test } from "bun:test";
import { Terminals } from "../src/acp/terminals";

test("terminals retain bounded UTF-8 output, report exit and enforce session ownership", async () => {
  const terminals = new Terminals(process.cwd(), () => {});
  try {
    const { terminalId } = terminals.create({ sessionId: "one", command: process.execPath, args: ["-e", 'process.stdout.write("hello 🐈🐈🐈")'], outputByteLimit: 9 });
    const params = { sessionId: "one", terminalId };
    expect(await terminals.wait(params)).toMatchObject({ exitCode: 0 });
    expect(terminals.output(params)).toMatchObject({ output: "🐈🐈", truncated: true });
    expect(() => terminals.output({ ...params, sessionId: "two" })).toThrow("Unknown terminal");
    terminals.release(params);
    expect(() => terminals.output(params)).toThrow("Unknown terminal");
  } finally { terminals.dispose(); }
});
