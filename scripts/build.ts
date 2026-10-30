import solidPlugin from "@opentui/solid/bun-plugin";

// Keep platform-native dependencies external. Run the bundle with Bun and the installed dependencies.
const result = await Bun.build({
  entrypoints: ["src/index.tsx", "src/demo-agent.ts"],
  outdir: "dist",
  target: "bun",
  packages: "external",
  plugins: [solidPlugin],
  sourcemap: "external",
});
if (!result.success) throw new AggregateError(result.logs, "Build failed");
console.log("Built dist/index.js. Run: bun --preload @opentui/solid/preload dist/index.js");
