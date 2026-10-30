import { createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { TextareaRenderable } from "@opentui/core";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ElicitationContentValue } from "@agentclientprotocol/sdk";
import type { Interaction } from "../controller";
import type { Theme } from "./theme";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export function InteractionView(props: { interaction: Interaction; theme: Theme; answer: (id?: string, content?: Record<string, ElicitationContentValue>) => void }) {
  const [index, setIndex] = createSignal(0);
  const [error, setError] = createSignal("");
  let editor: TextareaRenderable | undefined;
  const defaults = Object.fromEntries(Object.entries(props.interaction.form?.properties ?? {}).map(([name, schema]) => [name, "default" in schema ? schema.default : schema.type === "boolean" ? false : schema.type === "number" || schema.type === "integer" ? 0 : schema.type === "array" ? [] : ""]));
  const submit = () => {
    try {
      const value = JSON.parse(editor?.plainText ?? "{}");
      const validate = ajv.compile<Record<string, ElicitationContentValue>>({ ...props.interaction.form, type: "object", additionalProperties: false });
      if (!validate(value)) { setError(ajv.errorsText(validate.errors)); return; }
      props.answer("accept", value);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  useKeyboard(key => {
    if (key.name === "escape") { key.preventDefault(); props.answer(); return; }
    if (props.interaction.form) {
      if (key.ctrl && key.name === "d") { key.preventDefault(); props.answer("decline"); }
      return;
    }
    if (key.name === "up" || key.name === "down") {
      key.preventDefault(); setIndex(i => Math.max(0, Math.min(props.interaction.options.length - 1, i + (key.name === "up" ? -1 : 1))));
    }
    if (key.name === "return") { key.preventDefault(); props.answer(props.interaction.options[index()]?.id); }
  });
  return <box flexDirection="column" border borderColor={props.theme.warning} backgroundColor={props.theme.panel} paddingX={1} flexShrink={0} maxHeight="60%">
    <text fg={props.theme.warning}>{props.interaction.title}</text>
    <Show when={props.interaction.description}><text fg={props.theme.muted}>{props.interaction.description}</text></Show>
    <Show when={props.interaction.url}><text fg={props.theme.accent} selectable>{props.interaction.url}</text></Show>
    <Show when={props.interaction.form} fallback={<>
      <For each={props.interaction.options}>{(option, i) => <text fg={i() === index() ? props.theme.accent : props.theme.text} onMouseDown={() => props.answer(option.id)}>{i() === index() ? "› " : "  "}{option.name}</text>}</For>
      <text fg={props.theme.muted}>↑↓ choose · Enter confirm · Esc cancel</text>
    </>}>
      <scrollbox maxHeight={5} scrollY>
        <For each={Object.entries(props.interaction.form?.properties ?? {})}>{([name, schema]) => <text fg={props.theme.muted}>{name}{props.interaction.form?.required?.includes(name) ? "*" : ""}: {JSON.stringify(schema)}</text>}</For>
      </scrollbox>
      <textarea ref={editor} focused height={6} initialValue={JSON.stringify(defaults, null, 2)} textColor={props.theme.text} backgroundColor={props.theme.bg} focusedBackgroundColor={props.theme.bg} keyBindings={[{ name: "return", ctrl: true, action: "submit" }]} onSubmit={submit} />
      <text fg={props.theme.muted}>Edit JSON · Ctrl+Enter submit · Ctrl+D decline · Esc cancel</text>
    </Show>
    <Show when={error()}><text fg={props.theme.error}>{error()}</text></Show>
  </box>;
}
