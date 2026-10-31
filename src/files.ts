import { readdir } from "node:fs/promises";
import { join } from "node:path";

const MAX_WALK_DEPTH = 8;
const MAX_WALK_FILES = 5000;
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "target"]);

/** Git honors repository ignore rules; the bounded fallback also works outside Git. */
export async function projectFiles(cwd: string): Promise<string[]> {
  try {
    const child = Bun.spawn(
      ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd, stdout: "pipe", stderr: "ignore" },
    );
    const output = await new Response(child.stdout).text();
    if ((await child.exited) === 0) return [...new Set(output.split("\0").filter(Boolean))].sort();
  } catch {
    /* Git may not be installed; directory walking still works. */
  }
  const files: string[] = [];
  const walk = async (directory: string, depth: number) => {
    if (depth > MAX_WALK_DEPTH || files.length >= MAX_WALK_FILES) return;
    for (const entry of await readdir(join(cwd, directory), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile()) files.push(path);
      if (files.length >= MAX_WALK_FILES) break;
    }
  };
  await walk("", 0);
  return files.sort();
}
