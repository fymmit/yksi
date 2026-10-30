import { createMemo, createSignal, For, Show } from "solid-js";
import { createTwoFilesPatch } from "diff";
import type { SyntaxStyle } from "@opentui/core";
import { contentText, type Message, type TimelineItem, type Tool } from "../state";
import { selectionColors, type Theme } from "./theme";
import { ThemedMarkdown } from "./markdown";
import { messageTime } from "./message-time";

function messageLabel(message: Message): string {
  const label = message.role === "user" ? "You" : "Assistant";
  const time = messageTime(message.createdAt);
  return time ? `${label} · ${time}` : label;
}

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
        {...selectionColors(props.theme)}
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
                  <text fg={props.theme.text} selectable {...selectionColors(props.theme)}>
                    {contentText(block.content)}
                  </text>
                )}
              </Show>
              <Show when={content.type === "diff" ? content : undefined} keyed>
                {block => (
                  <box flexDirection="column">
                    <text {...selectionColors(props.theme)} fg={props.theme.muted}>
                      {block.path}
                    </text>
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
                      {...selectionColors(props.theme)}
                      addedBg={props.theme.diffAddedBackground}
                      removedBg={props.theme.diffRemovedBackground}
                      contextBg={props.theme.diffContextBackground}
                      addedContentBg={props.theme.diffAddedContentBackground}
                      removedContentBg={props.theme.diffRemovedContentBackground}
                      contextContentBg={props.theme.diffContextContentBackground}
                      addedSignColor={props.theme.diffAddedSign}
                      removedSignColor={props.theme.diffRemovedSign}
                      lineNumberFg={props.theme.diffLineNumber}
                      lineNumberBg={props.theme.diffLineNumberBackground}
                      addedLineNumberBg={props.theme.diffAddedLineNumberBackground}
                      removedLineNumberBg={props.theme.diffRemovedLineNumberBackground}
                      wrapMode="word"
                    />
                  </box>
                )}
              </Show>
              <Show when={content.type === "terminal" ? content : undefined} keyed>
                {block => (
                  <text fg={props.theme.text} selectable {...selectionColors(props.theme)}>
                    {props.terminals[block.terminalId] ?? "Terminal output is no longer available."}
                  </text>
                )}
              </Show>
            </>
          )}
        </For>
        <Show when={!props.tool.content?.length && raw()}>
          <text fg={props.theme.muted} maxHeight={40} selectable {...selectionColors(props.theme)}>
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
          <Show
            when={message.role === "user" || message.role === "agent"}
            fallback={
              <box flexDirection="column" marginBottom={1} paddingX={1} flexShrink={0}>
                <text {...selectionColors(props.theme)} fg={props.theme.muted}>
                  {message.role === "thought" ? "Reasoning" : "System"}
                </text>
                <text fg={props.theme.muted} selectable {...selectionColors(props.theme)}>
                  {message.text}
                </text>
              </box>
            }
          >
            <box
              width="100%"
              flexDirection="row"
              justifyContent={message.role === "user" ? "flex-end" : "flex-start"}
              marginBottom={1}
              flexShrink={0}
            >
              <box
                width="85%"
                flexDirection="column"
                border={["top", "bottom", "left", "right"]}
                borderColor={message.role === "user" ? props.theme.accent : props.theme.border}
                backgroundColor={
                  message.role === "user" ? props.theme.selectedBackground : props.theme.panel
                }
                paddingX={1}
              >
                <text
                  {...selectionColors(props.theme)}
                  fg={message.role === "user" ? props.theme.accent : props.theme.muted}
                >
                  {messageLabel(message)}
                </text>
                <Show
                  when={message.role === "agent"}
                  fallback={
                    <text fg={props.theme.text} selectable {...selectionColors(props.theme)}>
                      {message.text}
                    </text>
                  }
                >
                  <ThemedMarkdown
                    content={message.text}
                    syntax={props.syntax}
                    theme={props.theme}
                    streaming={props.streaming}
                    background={props.theme.panel}
                  />
                </Show>
              </box>
            </box>
          </Show>
        )}
      </Show>
    </>
  );
}
