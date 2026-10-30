import { SyntaxStyle, type CliRenderer, type StyleDefinitionInput } from "@opentui/core";
import { themePresets, type Theme } from "../themes";

export type { Theme } from "../themes";
// Convenient defaults for isolated component rendering.
export const themes = { dark: themePresets.dark.theme, light: themePresets.light.theme };

export function syntaxStyle(renderer: CliRenderer, theme: Theme) {
  const m = theme.markdown;
  const styles: Record<string, StyleDefinitionInput> = Object.fromEntries(
    Object.entries(theme.syntax).map(([name, fg]) => [name, { fg }]),
  );
  // OpenTUI falls back to the first scope segment, not its immediate parent.
  for (let level = 1; level <= 6; level++)
    styles[`markup.heading.${level}`] = { fg: m.heading, bold: true };
  return SyntaxStyle.fromStyles(
    {
      ...styles,
      comment: { fg: theme.syntax.comment, italic: true },
      "markup.heading": { fg: m.heading, bold: true },
      "markup.strong": { fg: m.strong, bold: true },
      "markup.italic": { fg: m.italic, italic: true },
      "markup.strikethrough": { fg: m.strikethrough },
      "markup.link": { fg: m.link, underline: true },
      "markup.link.label": { fg: m.link, underline: true },
      "markup.link.bracket.close": { fg: m.link, underline: true },
      "markup.link.url": { fg: m.linkUrl, underline: true },
      "string.special.url": { fg: m.linkUrl, underline: true },
      "markup.raw": { fg: m.raw, bg: m.rawBackground },
      "markup.raw.block": { fg: theme.syntax.default, bg: m.codeBackground },
      "markup.quote": { fg: m.quote },
      "markup.list": { fg: m.list },
      "markup.list.checked": { fg: m.list },
      "markup.list.unchecked": { fg: m.list },
      conceal: { fg: m.conceal },
    },
    renderer.nativeScene,
  );
}

export function editorColors(theme: Theme) {
  return {
    textColor: theme.inputText,
    focusedTextColor: theme.inputFocusedText,
    backgroundColor: theme.inputBackground,
    focusedBackgroundColor: theme.inputFocusedBackground,
    placeholderColor: theme.placeholder,
    cursorColor: theme.cursor,
    selectionBg: theme.selectionBackground,
    selectionFg: theme.selectionText,
  };
}

export function selectionColors(theme: Theme) {
  return { selectionBg: theme.selectionBackground, selectionFg: theme.selectionText };
}

export function scrollbarColors(theme: Theme) {
  return {
    trackOptions: { backgroundColor: theme.scrollbarTrack, foregroundColor: theme.scrollbarThumb },
    arrowOptions: {
      backgroundColor: theme.scrollbarArrowBackground,
      foregroundColor: theme.scrollbarArrow,
    },
  };
}
