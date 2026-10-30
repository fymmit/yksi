import { createMemo, createSignal, For, Show } from "solid-js";
import { createTwoFilesPatch } from "diff";
import type { SyntaxStyle } from "@opentui/core";
import { contentText, type TimelineItem, type Tool } from "../state";
import type { Theme } from "./theme";

function ToolCard(props: {
  tool: Tool;
  theme: Theme;
  syntax: SyntaxStyle;
  expanded: boolean;
  terminals: Record<string, string>;
}) {
  const [override, setOverride] = createSignal<boolean>();
  const expanded = () => override() ?? props.expanded;
  const raw = createMemo(() => {
    const value = props.tool.rawOutput ?? props.tool.rawInput;
    return value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  });
  return (
    <box
      flexDirection="column"
      border={["left"]}
      borderColor={props.tool.status === "failed" ? props.theme.error : props.theme.border}
      paddingLeft={1}
      marginBottom={1}
      flexShrink={0}
    >
      <text
        fg={props.tool.status === "failed" ? props.theme.error : props.theme.accent}
        onMouseDown={() => setOverride(!expanded())}
      >
        {expanded() ? "▾" : "▸"} {props.tool.title} · {props.tool.status ?? "pending"}
      </text>
      <Show when={expanded()}>
        <For each={props.tool.content ?? []}>
          {content => (
            <>
              <Show when={content.type === "content" ? content : undefined} keyed>
                {block => (
                  <text fg={props.theme.text} selectable>
                    {contentText(block.content)}
                  </text>
                )}
              </Show>
              <Show when={content.type === "diff" ? content : undefined} keyed>
                {block => (
                  <box flexDirection="column">
                    <text fg={props.theme.muted}>{block.path}</text>
                    <diff
                      diff={createTwoFilesPatch(
                        block.path,
                        block.path,
                        block.oldText ?? "",
                        block.newText,
                      )}
                      view="unified"
                      syntaxStyle={props.syntax}
                      fg={props.theme.text}
                      addedBg={props.theme.added}
                      removedBg={props.theme.removed}
                      contextBg={props.theme.bg}
                      wrapMode="word"
                    />
                  </box>
                )}
              </Show>
              <Show when={content.type === "terminal" ? content : undefined} keyed>
                {block => (
                  <text fg={props.theme.text} selectable>
                    {props.terminals[block.terminalId] ?? "Terminal output is no longer available."}
                  </text>
                )}
              </Show>
            </>
          )}
        </For>
        <Show when={!props.tool.content?.length && raw()}>
          <text fg={props.theme.muted} maxHeight={40} selectable>
            {raw().slice(0, 16000)}
          </text>
        </Show>
      </Show>
    </box>
  );
}

export function TimelineEntry(props: {
  item: TimelineItem;
  theme: Theme;
  syntax: SyntaxStyle;
  expanded: boolean;
  thoughts: boolean;
  streaming: boolean;
  terminals: Record<string, string>;
}) {
  return (
    <>
      <Show when={props.item.type === "tool" ? props.item : undefined} keyed>
        {tool => (
          <ToolCard
            tool={tool}
            theme={props.theme}
            syntax={props.syntax}
            expanded={props.expanded}
            terminals={props.terminals}
          />
        )}
      </Show>
      <Show
        when={
          props.item.type === "message" && (props.item.role !== "thought" || props.thoughts)
            ? props.item
            : undefined
        }
        keyed
      >
        {message => (
          <box flexDirection="column" marginBottom={1} paddingX={1} flexShrink={0}>
            <text fg={message.role === "user" ? props.theme.accent : props.theme.muted}>
              {message.role === "user"
                ? "You"
                : message.role === "agent"
                  ? "Assistant"
                  : message.role === "thought"
                    ? "Reasoning"
                    : "System"}
            </text>
            <Show
              when={message.role === "agent"}
              fallback={
                <text
                  fg={
                    message.role === "thought" || message.role === "system"
                      ? props.theme.muted
                      : props.theme.text
                  }
                  selectable
                >
                  {message.text}
                </text>
              }
            >
              <markdown
                content={message.text}
                syntaxStyle={props.syntax}
                fg={props.theme.text}
                streaming={props.streaming}
              />
            </Show>
          </box>
        )}
      </Show>
    </>
  );
}
