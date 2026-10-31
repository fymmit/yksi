import { performance } from "node:perf_hooks";
import { Controller } from "../src/controller";
import { configSchema } from "../src/config";
import { Storage } from "../src/storage";
import { applyUpdate, type TimelineItem } from "../src/state";

function measure(name: string, operation: () => void, iterations = 30) {
  for (let i = 0; i < 5; i++) operation();
  const samples = Array.from({ length: iterations }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return {
    operation: name,
    median_ms: samples[Math.floor(samples.length / 2)]!.toFixed(3),
    p95_ms: samples[Math.floor(samples.length * 0.95)]!.toFixed(3),
  };
}

// In-memory SQLite isolates serialization/SQL cost from disk latency. This is a
// reproducible diagnostic, not a timing-sensitive CI assertion or UI benchmark.
for (const size of [1000, 10000, 50000]) {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/benchmark", "opencode");
  try {
    controller.session.items = Array.from(
      { length: size },
      (_, i): TimelineItem =>
        i % 4 === 3
          ? {
              id: String(i),
              type: "tool",
              toolCallId: String(i),
              title: "Edit file",
              status: "completed",
              content: [
                {
                  type: "diff",
                  path: "/benchmark/file.ts",
                  oldText: "old\n".repeat(20),
                  newText: "new\n".repeat(20),
                },
              ],
            }
          : {
              id: String(i),
              type: "message",
              role: i % 2 ? "agent" : "user",
              text: "Representative streaming message. ".repeat(30),
            },
    );
    const session = controller.session;
    console.log(
      `\n${size} items, ${(JSON.stringify(session).length / 1024 / 1024).toFixed(1)} MiB JSON`,
    );
    console.table([
      measure("snapshot", () => {
        controller.snapshot();
      }),
      measure("serialize + sqlite", () => storage.save(session)),
      measure(
        "late tool patch",
        () =>
          applyUpdate(session, {
            sessionUpdate: "tool_call_update",
            toolCallId: String(size - 1),
            status: "completed",
          }),
        100,
      ),
    ]);
  } finally {
    controller.dispose();
    storage.close();
  }
}
