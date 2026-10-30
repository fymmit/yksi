import { createMemo, createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ScrollBoxRenderable } from "@opentui/core";
import {
  keyActions,
  keyDescriptions,
  type KeyAction,
  type Keybindings,
  type KeyContext,
} from "../keybindings";
import { consumeKey, suppressEditorFallback } from "./keybindings";
import { editorColors, scrollbarColors, selectionColors, type Theme } from "./theme";

const contextNames: Record<KeyContext, string> = {
  composer: "Composer",
  picker: "Pickers",
  permission: "Permissions",
  "form.text": "Forms · Text",
  "form.choice": "Forms · Choices",
  "form.json": "Forms · JSON",
  help: "Help window",
};
const sections = ["Application", "Composer", "Pickers", "Permissions", "Forms", "Help window"];
const sectionFor = (id: KeyAction) =>
  sections[["app", "composer", "picker", "permission", "form", "help"].indexOf(id.split(".")[0]!)]!;

export function KeyboardHelp(props: {
  context: KeyContext;
  keys: Keybindings;
  theme: Theme;
  width: number;
  height: number;
  close: () => void;
}) {
  const [query, setQuery] = createSignal("");
  let scroll: ScrollBoxRenderable | undefined;
  const groups = createMemo(() => {
    const search = query().trim().toLowerCase();
    const actions = (Object.keys(keyActions) as KeyAction[]).filter(id =>
      `${id} ${keyDescriptions[id]} ${props.keys.label(id) || "Unbound"} ${sectionFor(id)}`
        .toLowerCase()
        .includes(search),
    );
    const prefix = props.context.split(".")[0];
    const current = actions
      .filter(id => keyActions[id].contexts.includes(props.context))
      .sort((a, b) => Number(!a.startsWith(`${prefix}.`)) - Number(!b.startsWith(`${prefix}.`)));
    return [
      { title: `Current context · ${contextNames[props.context]}`, actions: current },
      ...sections.map(title => ({
        title,
        actions: actions.filter(id => sectionFor(id) === title && !current.includes(id)),
      })),
    ].filter(group => group.actions.length);
  });
  useKeyboard(key => {
    if (key.defaultPrevented) return;
    if (props.keys.matches("app.cancel", key) || props.keys.matches("app.help", key)) {
      if (consumeKey(key)) props.close();
      return;
    }
    for (const [id, amount] of [
      ["help.previous", -1],
      ["help.next", 1],
      ["help.pageUp", -10],
      ["help.pageDown", 10],
    ] as const) {
      if (props.keys.matches(id, key)) {
        if (consumeKey(key, true)) scroll?.scrollBy(amount);
        return;
      }
    }
    suppressEditorFallback(key);
  });
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height={Math.max(1, props.height - 1)}
      zIndex={100}
      alignItems="center"
      justifyContent="center"
      onMouseDown={event => event.stopPropagation()}
    >
      <box
        width={Math.max(1, Math.min(88, props.width - 2))}
        height={Math.max(1, Math.min(32, props.height - 3))}
        border
        borderColor={props.theme.focusBorder}
        backgroundColor={props.theme.panel}
        paddingX={1}
        flexDirection="column"
      >
        <text {...selectionColors(props.theme)} fg={props.theme.accent} flexShrink={0} height={1}>
          Keyboard shortcuts
        </text>
        <input
          focused
          placeholder="Search actions or keys…"
          flexShrink={0}
          {...editorColors(props.theme)}
          onInput={value => {
            setQuery(value);
            scroll?.scrollTo(0);
          }}
        />
        <scrollbox
          ref={scroll}
          scrollY
          flexGrow={1}
          minHeight={0}
          scrollbarOptions={scrollbarColors(props.theme)}
        >
          <For each={groups()}>
            {group => (
              <box flexDirection="column" flexShrink={0}>
                <text {...selectionColors(props.theme)} fg={props.theme.accent} marginTop={1}>
                  {group.title}
                </text>
                <For each={group.actions}>
                  {id => (
                    <box flexDirection="column" flexShrink={0}>
                      <text {...selectionColors(props.theme)} fg={props.theme.text}>
                        {keyDescriptions[id]}
                      </text>
                      <text {...selectionColors(props.theme)} fg={props.theme.muted}>
                        {" "}
                        {props.keys.label(id) || "Unbound"}
                      </text>
                    </box>
                  )}
                </For>
              </box>
            )}
          </For>
          <Show when={!groups().length}>
            <text {...selectionColors(props.theme)} fg={props.theme.muted}>
              No matching shortcuts
            </text>
          </Show>
        </scrollbox>
        <text {...selectionColors(props.theme)} fg={props.theme.muted} flexShrink={0} maxHeight={2}>
          {props.keys.hint("help.previous", "up")} · {props.keys.hint("help.next", "down")} ·{" "}
          {props.keys.hint("app.cancel", "close")}
        </text>
      </box>
    </box>
  );
}
