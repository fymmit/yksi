import { SyntaxStyle, type CliRenderer } from "@opentui/core";

export const themes = {
  dark: { bg: "#10151d", panel: "#18212d", border: "#344357", text: "#d9e2f0", muted: "#91a0b5", accent: "#7dd3c7", warning: "#f2c879", error: "#f18b9c", added: "#16392e", removed: "#40242e" },
  light: { bg: "#f4f6fa", panel: "#e6ebf2", border: "#a4afbf", text: "#263346", muted: "#586a80", accent: "#096f66", warning: "#896000", error: "#ad2748", added: "#d2ecdf", removed: "#f5dce1" },
};
export type ThemeName = keyof typeof themes;
export type Theme = typeof themes.dark;
export function syntaxStyle(renderer: CliRenderer, theme: Theme) {
  return SyntaxStyle.fromStyles({
    default: { fg: theme.text }, "markup.heading": { fg: theme.accent, bold: true },
    "markup.strong": { bold: true }, "markup.italic": { italic: true },
    "markup.link": { fg: theme.accent, underline: true }, "markup.raw": { fg: theme.warning },
    keyword: { fg: theme.accent }, string: { fg: theme.warning }, comment: { fg: theme.muted, italic: true },
    number: { fg: theme.error }, function: { fg: theme.accent }, type: { fg: theme.warning },
  }, renderer.nativeScene);
}
