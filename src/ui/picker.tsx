import { createMemo, createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { Theme } from "./theme";

export type Choice = { id: string; label: string; detail?: string; run: () => unknown };
export function Picker(props: { title: string; choices: Choice[]; theme: Theme; height: number; close: () => void; error: (error: unknown) => void }) {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  const choices = createMemo(() => props.choices.filter(c => `${c.label} ${c.detail ?? ""}`.toLowerCase().includes(query().toLowerCase())));
  const visible = createMemo(() => {
    const size = Math.max(2, Math.min(10, props.height - 10));
    const start = Math.max(0, index() - size + 1);
    return choices().slice(start, start + size);
  });
  const select = (choice?: Choice) => {
    if (!choice) return;
    props.close();
    try { void Promise.resolve(choice.run()).catch(props.error); } catch (error) { props.error(error); }
  };
  useKeyboard(key => {
    if (key.name === "up" || key.name === "down") {
      key.preventDefault();
      setIndex(i => Math.max(0, Math.min(choices().length - 1, i + (key.name === "up" ? -1 : 1))));
    } else if (key.name === "return") { key.preventDefault(); select(choices()[index()]); }
  });
  return <box flexDirection="column" border borderColor={props.theme.accent} backgroundColor={props.theme.panel} paddingX={1} flexShrink={0}>
    <text fg={props.theme.accent}>{props.title} · Esc close</text>
    <input focused placeholder="Type to filter…" onInput={value => { setQuery(value); setIndex(0); }} textColor={props.theme.text} backgroundColor={props.theme.panel} focusedBackgroundColor={props.theme.panel} />
    <For each={visible()}>{choice => <box onMouseDown={() => select(choice)} flexDirection="column" backgroundColor={choices()[index()]?.id === choice.id ? props.theme.border : props.theme.panel}>
      <text fg={props.theme.text}>{choices()[index()]?.id === choice.id ? "› " : "  "}{choice.label}</text>
      <Show when={choice.detail}><text fg={props.theme.muted} maxHeight={1}>  {choice.detail}</text></Show>
    </box>}</For>
    <Show when={!choices().length}><text fg={props.theme.muted}>No matches</text></Show>
  </box>;
}
