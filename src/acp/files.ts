import { isAbsolute } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type * as acp from "@agentclientprotocol/sdk";

function absolute(path: string) {
  if (!isAbsolute(path)) throw new Error("ACP file paths must be absolute");
}
export async function readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
  absolute(params.path);
  const content = await readFile(params.path, "utf8");
  if (params.line == null && params.limit == null) return { content };
  const start = Math.max(0, (params.line ?? 1) - 1);
  return { content: content.split("\n").slice(start, params.limit == null ? undefined : start + params.limit).join("\n") };
}
export async function writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
  absolute(params.path);
  await writeFile(params.path, params.content, "utf8");
  return {};
}
