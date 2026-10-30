import { createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ElicitationContentValue } from "@agentclientprotocol/sdk";
import type { Interaction } from "../controller";
import type { Theme } from "./theme";
import { FormView } from "./form";
import { defaultKeybindings, type Keybindings, type KeyContext } from "../keybindings";
import { consumeKey } from "./keybindings";

export function InteractionView(props: { interaction: Interaction; theme: Theme; keys?: Keybindings; active?: boolean; onContext?: (context: KeyContext) => void; answer: (id?: string, content?: Record<string, ElicitationContentValue>) => void }) {
  const keys = props.keys ?? defaultKeybindings;
  const [index, setIndex] = createSignal(0);
  useKeyboard(key => {
    if (key.defaultPrevented || props.active === false) return;
    if (keys.matches("app.cancel", key)) { if (consumeKey(key)) props.answer(); return; }
    if (props.interaction.form) {
      if (keys.matches("form.decline", key)) { if (consumeKey(key)) props.answer("decline"); }
      return;
    }
    if (keys.matches("permission.previous", key) || keys.matches("permission.next", key)) {
      if (consumeKey(key, true)) setIndex(i => Math.max(0, Math.min(props.interaction.options.length - 1, i + (keys.matches("permission.previous", key) ? -1 : 1))));
    }
    if (keys.matches("permission.confirm", key)) { if (consumeKey(key)) props.answer(props.interaction.options[index()]?.id); }
  });
  return <box flexDirection="column" border borderColor={props.theme.warning} backgroundColor={props.theme.panel} paddingX={1} flexShrink={0} maxHeight="60%">
    <text fg={props.theme.warning} flexShrink={0}>{props.interaction.title}</text>
    <Show when={props.interaction.description}><text fg={props.theme.muted} flexShrink={0}>{props.interaction.description}</text></Show>
    <Show when={props.interaction.url}><text fg={props.theme.accent} flexShrink={0} selectable>{props.interaction.url}</text></Show>
    <Show when={props.interaction.form} fallback={<>
      <For each={props.interaction.options}>{(option, i) => <text fg={i() === index() ? props.theme.accent : props.theme.text} onMouseDown={() => { if (props.active !== false) props.answer(option.id); }}>{i() === index() ? "› " : "  "}{option.name}</text>}</For>
      <text fg={props.theme.muted}>{keys.hint("permission.previous", "previous")} · {keys.hint("permission.next", "next")} · {keys.hint("permission.confirm", "confirm")} · {keys.hint("app.cancel", "cancel")}</text>
    </>}>
      <Show when={props.interaction.form} keyed>{schema => <FormView schema={schema} theme={props.theme} keys={keys} active={props.active} onContext={props.onContext} answer={props.answer} />}</Show>
    </Show>
  </box>;
}
