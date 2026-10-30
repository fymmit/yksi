#!/usr/bin/env bun
// Register Solid's runtime transform before loading TSX, even outside this repo.
import "@opentui/solid/preload";
await import("../src/index.tsx");
