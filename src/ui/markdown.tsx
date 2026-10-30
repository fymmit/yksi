import { createMemo } from "solid-js";
import {
  RGBA,
  CodeRenderable,
  TextBufferRenderable,
  TextTableRenderable,
  type MarkdownOptions,
  type Renderable,
  type SyntaxStyle,
} from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { selectionColors, type Theme } from "./theme";

// Markdown doesn't expose selection colors. Its public node hook lets us theme
// tables at construction (they have no selection setters), retaining normal
// incremental reconciliation for the other blocks.
export function ThemedMarkdown(props: {
  content: string;
  syntax: SyntaxStyle;
  theme: Theme;
  streaming: boolean;
}) {
  const renderer = useRenderer();
  const selected = new WeakMap<Renderable, Theme>();
  const codeBackground = createMemo(() => RGBA.fromHex(props.theme.markdown.codeBackground));
  const codeForeground = createMemo(() => RGBA.fromHex(props.theme.syntax.default));
  const applySelection = (node: Renderable) => {
    if (node instanceof TextBufferRenderable) {
      if (selected.get(node) !== props.theme) {
        Object.assign(node, selectionColors(props.theme));
        selected.set(node, props.theme);
      }
      // Prose uses concealed Markdown; fenced code (including nested fences)
      // uses its language with concealment disabled.
      if (node instanceof CodeRenderable && (node.filetype !== "markdown" || !node.conceal)) {
        if (!codeBackground().equals(node.bg)) node.bg = codeBackground();
        if (!codeForeground().equals(node.fg)) node.fg = codeForeground();
      }
    }
    for (const child of node.getChildren()) applySelection(child);
  };
  const renderNode = createMemo<NonNullable<MarkdownOptions["renderNode"]>>(() => {
    const theme = props.theme;
    const render: NonNullable<MarkdownOptions["renderNode"]> = (_token, context) => {
      const block = context.defaultRender();
      if (block instanceof TextTableRenderable) {
        return new TextTableRenderable(renderer, {
          content: block.content,
          width: "100%",
          marginBottom: block.marginBottom ?? undefined,
          columnWidthMode: block.columnWidthMode,
          columnFitter: block.columnFitter,
          wrapMode: block.wrapMode,
          cellPaddingX: block.cellPaddingX,
          cellPaddingY: block.cellPaddingY,
          columnGap: block.columnGap,
          border: block.border,
          outerBorder: block.outerBorder,
          showBorders: block.showBorders,
          borderStyle: block.borderStyle,
          borderColor: theme.markdown.tableBorder,
          borderBackgroundColor: theme.background,
          backgroundColor: theme.background,
          fg: theme.text,
          bg: theme.background,
          selectable: true,
          ...selectionColors(theme),
        });
      }
      return block;
    };
    // OpenTUI 0.8's codeBlockOnly flag preserves adjacent prose coalescing.
    // Without it, a node hook splits streaming paragraph chunks onto new lines.
    // The hook still receives structured blocks (including tables).
    return Object.assign(render, { codeBlockOnly: true });
  });
  return (
    <markdown
      content={props.content}
      syntaxStyle={props.syntax}
      fg={props.theme.text}
      bg={props.theme.background}
      streaming={props.streaming}
      tableOptions={{ borderColor: props.theme.markdown.tableBorder }}
      renderNode={renderNode()}
      renderBefore={function () {
        applySelection(this);
      }}
    />
  );
}
