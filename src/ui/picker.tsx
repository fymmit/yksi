import { createMemo, createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { Theme } from "./theme";
import { defaultKeybindings, type Keybindings } from "../keybindings";
import { consumeKey, suppressEditorFallback } from "./keybindings";

export type Choice = { id: string; label: string; detail?: string; run: () => unknown };
export function Picker(props: {
  title: string;
  choices: Choice[];
  theme: Theme;
  keys?: Keybindings;
  active?: boolean;
  height: number;
  close: () => void;
  error: (error: unknown) => void;
}) {
  const keys = props.keys ?? defaultKeybindings;
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  const choices = createMemo(() =>
    props.choices.filter(c =>
      `${c.label} ${c.detail ?? ""}`.toLowerCase().includes(query().toLowerCase()),
    ),
  );
  const visible = createMemo(() => {
    const size = Math.max(2, Math.min(10, props.height - 10));
    const start = Math.max(0, index() - size + 1);
    return choices().slice(start, start + size);
  });
  const select = (choice?: Choice) => {
    if (!choice || props.active === false) return;
    props.close();
    try {
      void Promise.resolve(choice.run()).catch(props.error);
    } catch (error) {
      props.error(error);
    }
  };
  useKeyboard(key => {
    if (key.defaultPrevented || props.active === false) return;
    if (keys.matches("app.cancel", key)) {
      if (consumeKey(key)) props.close();
      return;
    }
    if (keys.matches("picker.previous", key) || keys.matches("picker.next", key)) {
      if (consumeKey(key, true))
        setIndex(i =>
          Math.max(
            0,
            Math.min(choices().length - 1, i + (keys.matches("picker.previous", key) ? -1 : 1)),
          ),
        );
    } else if (keys.matches("picker.confirm", key)) {
      if (consumeKey(key)) select(choices()[index()]);
    } else suppressEditorFallback(key);
  });
  return (
    <box
      flexDirection="column"
      border
      borderColor={props.theme.accent}
      backgroundColor={props.theme.panel}
      paddingX={1}
      flexShrink={0}
    >
      <text fg={props.theme.accent}>
        {props.title} · {keys.hint("app.cancel", "close")}
      </text>
      <input
        focused={props.active !== false}
        placeholder="Type to filter…"
        onInput={value => {
          setQuery(value);
          setIndex(0);
        }}
        textColor={props.theme.text}
        backgroundColor={props.theme.panel}
        focusedBackgroundColor={props.theme.panel}
      />
      <For each={visible()}>
        {choice => (
          <box
            onMouseDown={() => select(choice)}
            flexDirection="column"
            backgroundColor={
              choices()[index()]?.id === choice.id ? props.theme.border : props.theme.panel
            }
          >
            <text fg={props.theme.text}>
              {choices()[index()]?.id === choice.id ? "› " : "  "}
              {choice.label}
            </text>
            <Show when={choice.detail}>
              <text fg={props.theme.muted} maxHeight={1}>
                {" "}
                {choice.detail}
              </text>
            </Show>
          </box>
        )}
      </For>
      <Show when={!choices().length}>
        <text fg={props.theme.muted}>No matches</text>
      </Show>
      <text fg={props.theme.muted}>
        {keys.hint("picker.previous", "previous")} · {keys.hint("picker.next", "next")} ·{" "}
        {keys.hint("picker.confirm", "confirm")}
      </text>
    </box>
  );
}
