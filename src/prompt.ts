import type * as acp from "@agentclientprotocol/sdk";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_ATTACHMENT_BYTES = 1024 * 1024;

/** Prepare local resources before accepting a prompt into conversation history. */
export async function preparePrompt(
  cwd: string,
  text: string,
  attachments: readonly string[],
  embeddedContext: boolean,
): Promise<acp.ContentBlock[]> {
  const prompt: acp.ContentBlock[] = [{ type: "text", text }];
  for (const path of attachments) {
    const absolute = resolve(cwd, path);
    const file = Bun.file(absolute);
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 1 MiB: ${path}`);
    const content = await file.text();
    if (content.includes("\0"))
      throw new Error(`Only text file attachments are supported: ${path}`);
    if (embeddedContext) {
      prompt.push({
        type: "resource",
        resource: { uri: pathToFileURL(absolute).href, text: content, mimeType: "text/plain" },
      });
    } else prompt.push({ type: "text", text: `\nFile: ${absolute}\n${content}` });
  }
  return prompt;
}
