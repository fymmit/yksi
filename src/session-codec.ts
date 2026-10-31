import Ajv from "ajv/dist/2020";
import acpSchema from "@agentclientprotocol/sdk/schema/v1/schema.json";
import type { Session } from "./state";

// Reuse the pinned stable ACP schema for protocol-owned data. Validation does not
// coerce values or strip extension metadata from saved transcripts.
const ajv = new Ajv({ strict: false, validateFormats: false });
const ref = (name: keyof typeof acpSchema.$defs) => ({ $ref: `#/$defs/${name}` });
const string = { type: "string" };
const timestamp = { type: "number", minimum: 0 };
const validate = ajv.compile<Session>({
  $defs: acpSchema.$defs,
  type: "object",
  required: [
    "id",
    "agent",
    "cwd",
    "title",
    "updatedAt",
    "items",
    "plan",
    "commands",
    "configOptions",
  ],
  properties: {
    id: string,
    agent: string,
    cwd: string,
    remoteId: string,
    title: string,
    updatedAt: timestamp,
    usageUpdatedAt: timestamp,
    items: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            required: ["id", "type", "role", "text"],
            properties: {
              id: string,
              type: { const: "message" },
              role: { enum: ["user", "agent", "thought", "system"] },
              text: string,
              createdAt: timestamp,
              messageId: { type: ["string", "null"] },
            },
          },
          {
            allOf: [
              ref("ToolCall"),
              {
                type: "object",
                required: ["id", "type"],
                properties: { id: string, type: { const: "tool" } },
              },
            ],
          },
        ],
      },
    },
    inputHistory: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "attachments"],
        properties: {
          text: string,
          attachments: { type: "array", items: string },
        },
      },
    },
    plan: { type: "array", items: ref("PlanEntry") },
    commands: { type: "array", items: ref("AvailableCommand") },
    configOptions: { type: "array", items: ref("SessionConfigOption") },
    modes: { anyOf: [ref("SessionModeState"), { type: "null" }] },
    usage: {
      allOf: [
        ref("UsageUpdate"),
        {
          type: "object",
          required: ["sessionUpdate"],
          properties: { sessionUpdate: { const: "usage_update" } },
        },
      ],
    },
    terminalOutput: { type: "object", additionalProperties: string },
  },
});

export function decodeSession(data: string): Session {
  const value: unknown = JSON.parse(data);
  if (!validate(value)) throw new Error(ajv.errorsText(validate.errors));
  return value;
}
