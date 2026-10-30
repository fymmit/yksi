import { createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ElicitationContentValue } from "@agentclientprotocol/sdk";
import type { Interaction } from "../controller";
import type { Theme } from "./theme";
import { FormView } from "./form";

export function InteractionView(props: { interaction: Interaction; theme: Theme; answer: (id?: string, content?: Record<string, ElicitationContentValue>) => void }) {
  const [index, setIndex] = createSignal(0);
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
    <text fg={props.theme.warning} flexShrink={0}>{props.interaction.title}</text>
    <Show when={props.interaction.description}><text fg={props.theme.muted} flexShrink={0}>{props.interaction.description}</text></Show>
    <Show when={props.interaction.url}><text fg={props.theme.accent} flexShrink={0} selectable>{props.interaction.url}</text></Show>
    <Show when={props.interaction.form} fallback={<>
      <For each={props.interaction.options}>{(option, i) => <text fg={i() === index() ? props.theme.accent : props.theme.text} onMouseDown={() => props.answer(option.id)}>{i() === index() ? "› " : "  "}{option.name}</text>}</For>
      <text fg={props.theme.muted}>↑↓ choose · Enter confirm · Esc cancel</text>
    </>}>
      <Show when={props.interaction.form} keyed>{schema => <FormView schema={schema} theme={props.theme} answer={props.answer} />}</Show>
    </Show>
  </box>;
}
