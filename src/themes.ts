import { z } from "zod";

export const colorNames = [
  "background",
  "panel",
  "border",
  "focusBorder",
  "text",
  "muted",
  "accent",
  "warning",
  "error",
  "inputBackground",
  "inputText",
  "inputFocusedBackground",
  "inputFocusedText",
  "placeholder",
  "cursor",
  "selectionBackground",
  "selectionText",
  "selectedBackground",
  "selectedText",
  "selectedMuted",
  "scrollbarTrack",
  "scrollbarThumb",
  "scrollbarArrow",
  "scrollbarArrowBackground",
  "diffAddedBackground",
  "diffRemovedBackground",
  "diffContextBackground",
  "diffAddedContentBackground",
  "diffRemovedContentBackground",
  "diffContextContentBackground",
  "diffAddedSign",
  "diffRemovedSign",
  "diffLineNumber",
  "diffLineNumberBackground",
  "diffAddedLineNumberBackground",
  "diffRemovedLineNumberBackground",
] as const;
export const syntaxNames = [
  "default",
  "keyword",
  "string",
  "comment",
  "number",
  "boolean",
  "function",
  "type",
  "variable",
  "constant",
  "property",
  "operator",
  "punctuation",
  "tag",
  "attribute",
  "constructor",
] as const;
export const markdownNames = [
  "heading",
  "link",
  "linkUrl",
  "raw",
  "rawBackground",
  "codeBackground",
  "quote",
  "list",
  "strong",
  "italic",
  "strikethrough",
  "conceal",
  "tableBorder",
] as const;

type Colors = Record<(typeof colorNames)[number], string>;
type Syntax = Record<(typeof syntaxNames)[number], string>;
type Markdown = Record<(typeof markdownNames)[number], string>;
export type Theme = Colors & { syntax: Syntax; markdown: Markdown };
export type ThemePreset = { label: string; theme: Theme };

const color = z.string().regex(/^#[\da-fA-F]{6}$/, "Expected a color in #RRGGBB format");
function overrides<const T extends readonly string[]>(names: T) {
  return z.partialRecord(z.enum(names), color);
}
export const customThemeSchema = z
  .object({
    extends: z.string().min(1),
    colors: overrides(colorNames).optional(),
    syntax: overrides(syntaxNames).optional(),
    markdown: overrides(markdownNames).optional(),
  })
  .strict();
export const themeSettingsSchema = z.object({
  theme: z.string().min(1).optional(),
  themes: z
    .record(
      z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens"),
      customThemeSchema,
    )
    .optional(),
});
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;

type Palette = {
  background: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  added: string;
  removed: string;
};
function preset(
  label: string,
  p: Palette,
  syntax: Partial<Omit<Syntax, "constructor">> = {},
): ThemePreset {
  return {
    label,
    theme: {
      background: p.background,
      panel: p.panel,
      border: p.border,
      focusBorder: p.accent,
      text: p.text,
      muted: p.muted,
      accent: p.accent,
      warning: p.yellow,
      error: p.red,
      inputBackground: p.panel,
      inputText: p.text,
      inputFocusedBackground: p.panel,
      inputFocusedText: p.text,
      placeholder: p.muted,
      cursor: p.accent,
      selectionBackground: p.border,
      selectionText: p.text,
      selectedBackground: p.border,
      selectedText: p.text,
      selectedMuted: p.text,
      scrollbarTrack: p.panel,
      scrollbarThumb: p.border,
      scrollbarArrow: p.muted,
      scrollbarArrowBackground: p.panel,
      diffAddedBackground: p.added,
      diffRemovedBackground: p.removed,
      diffContextBackground: p.background,
      diffAddedContentBackground: p.added,
      diffRemovedContentBackground: p.removed,
      diffContextContentBackground: p.background,
      diffAddedSign: p.green,
      diffRemovedSign: p.red,
      diffLineNumber: p.muted,
      diffLineNumberBackground: p.panel,
      diffAddedLineNumberBackground: p.added,
      diffRemovedLineNumberBackground: p.removed,
      syntax: {
        default: p.text,
        keyword: p.purple,
        string: p.green,
        comment: p.muted,
        number: p.yellow,
        boolean: p.yellow,
        function: p.blue,
        type: p.yellow,
        variable: p.text,
        constant: p.yellow,
        property: p.text,
        operator: p.accent,
        punctuation: p.muted,
        tag: p.red,
        attribute: p.yellow,
        constructor: p.blue,
        ...syntax,
      },
      markdown: {
        heading: p.accent,
        link: p.blue,
        linkUrl: p.accent,
        raw: p.yellow,
        rawBackground: p.panel,
        codeBackground: p.background,
        quote: p.muted,
        list: p.accent,
        strong: p.text,
        italic: p.text,
        strikethrough: p.muted,
        conceal: p.muted,
        tableBorder: p.border,
      },
    },
  };
}

// Palette sources: github.com/morhetz/gruvbox, github.com/catppuccin/palette,
// github.com/primer/primitives, github.com/dracula/dracula-theme,
// github.com/nordtheme/nord, github.com/folke/tokyonight.nvim.
export const themePresets = {
  dark: preset(
    "Dark",
    {
      background: "#10151d",
      panel: "#18212d",
      border: "#344357",
      text: "#d9e2f0",
      muted: "#91a0b5",
      accent: "#7dd3c7",
      red: "#f18b9c",
      green: "#7dd3c7",
      yellow: "#f2c879",
      blue: "#7dd3c7",
      purple: "#7dd3c7",
      added: "#16392e",
      removed: "#40242e",
    },
    { string: "#f2c879", number: "#f18b9c" },
  ),
  light: preset(
    "Light",
    {
      background: "#f4f6fa",
      panel: "#e6ebf2",
      border: "#a4afbf",
      text: "#263346",
      muted: "#586a80",
      accent: "#096f66",
      red: "#ad2748",
      green: "#096f66",
      yellow: "#896000",
      blue: "#096f66",
      purple: "#096f66",
      added: "#d2ecdf",
      removed: "#f5dce1",
    },
    { string: "#896000", number: "#ad2748" },
  ),
  "gruvbox-dark": preset(
    "Gruvbox Dark",
    {
      background: "#282828",
      panel: "#3c3836",
      border: "#504945",
      text: "#ebdbb2",
      muted: "#a89984",
      accent: "#8ec07c",
      red: "#fb4934",
      green: "#b8bb26",
      yellow: "#fabd2f",
      blue: "#83a598",
      purple: "#d3869b",
      added: "#3c4421",
      removed: "#442d2c",
    },
    { keyword: "#fb4934", function: "#b8bb26", type: "#fabd2f", number: "#d3869b" },
  ),
  "gruvbox-light": preset(
    "Gruvbox Light",
    {
      background: "#fbf1c7",
      panel: "#ebdbb2",
      border: "#d5c4a1",
      text: "#3c3836",
      muted: "#7c6f64",
      accent: "#427b58",
      red: "#9d0006",
      green: "#79740e",
      yellow: "#b57614",
      blue: "#076678",
      purple: "#8f3f71",
      added: "#e0e5b1",
      removed: "#f3d3b1",
    },
    { keyword: "#9d0006", function: "#79740e", number: "#8f3f71" },
  ),
  "catppuccin-latte": preset(
    "Catppuccin Latte",
    {
      background: "#eff1f5",
      panel: "#e6e9ef",
      border: "#ccd0da",
      text: "#4c4f69",
      muted: "#6c6f85",
      accent: "#8839ef",
      red: "#d20f39",
      green: "#40a02b",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      purple: "#8839ef",
      added: "#d8e8d7",
      removed: "#edd5df",
    },
    { number: "#fe640b", operator: "#179299", property: "#1e66f5" },
  ),
  "catppuccin-frappe": preset(
    "Catppuccin Frappé",
    {
      background: "#303446",
      panel: "#292c3c",
      border: "#51576d",
      text: "#c6d0f5",
      muted: "#949cbb",
      accent: "#ca9ee6",
      red: "#e78284",
      green: "#a6d189",
      yellow: "#e5c890",
      blue: "#8caaee",
      purple: "#ca9ee6",
      added: "#414d45",
      removed: "#4b404f",
    },
    { number: "#ef9f76", operator: "#81c8be", property: "#8caaee" },
  ),
  "catppuccin-macchiato": preset(
    "Catppuccin Macchiato",
    {
      background: "#24273a",
      panel: "#1e2030",
      border: "#494d64",
      text: "#cad3f5",
      muted: "#939ab7",
      accent: "#c6a0f6",
      red: "#ed8796",
      green: "#a6da95",
      yellow: "#eed49f",
      blue: "#8aadf4",
      purple: "#c6a0f6",
      added: "#38423f",
      removed: "#423647",
    },
    { number: "#f5a97f", operator: "#8bd5ca", property: "#8aadf4" },
  ),
  "catppuccin-mocha": preset(
    "Catppuccin Mocha",
    {
      background: "#1e1e2e",
      panel: "#181825",
      border: "#45475a",
      text: "#cdd6f4",
      muted: "#9399b2",
      accent: "#cba6f7",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      purple: "#cba6f7",
      added: "#334139",
      removed: "#3e2f40",
    },
    { number: "#fab387", operator: "#94e2d5", property: "#89b4fa" },
  ),
  "github-dark": preset(
    "GitHub Dark",
    {
      background: "#0d1117",
      panel: "#161b22",
      border: "#30363d",
      text: "#e6edf3",
      muted: "#8b949e",
      accent: "#58a6ff",
      red: "#ff7b72",
      green: "#7ee787",
      yellow: "#d29922",
      blue: "#79c0ff",
      purple: "#d2a8ff",
      added: "#12261e",
      removed: "#2d1619",
    },
    {
      keyword: "#ff7b72",
      string: "#a5d6ff",
      function: "#d2a8ff",
      number: "#79c0ff",
      type: "#ffa657",
    },
  ),
  "github-light": preset(
    "GitHub Light",
    {
      background: "#ffffff",
      panel: "#f6f8fa",
      border: "#d0d7de",
      text: "#24292f",
      muted: "#57606a",
      accent: "#0969da",
      red: "#cf222e",
      green: "#116329",
      yellow: "#9a6700",
      blue: "#0550ae",
      purple: "#8250df",
      added: "#dafbe1",
      removed: "#ffebe9",
    },
    {
      keyword: "#cf222e",
      string: "#0a3069",
      function: "#8250df",
      number: "#0550ae",
      type: "#953800",
    },
  ),
  dracula: preset(
    "Dracula",
    {
      background: "#282a36",
      panel: "#21222c",
      border: "#44475a",
      text: "#f8f8f2",
      muted: "#6272a4",
      accent: "#bd93f9",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#8be9fd",
      purple: "#ff79c6",
      added: "#30443e",
      removed: "#49313b",
    },
    { string: "#f1fa8c", function: "#50fa7b", type: "#8be9fd", number: "#bd93f9" },
  ),
  nord: preset(
    "Nord",
    {
      background: "#2e3440",
      panel: "#3b4252",
      border: "#4c566a",
      text: "#d8dee9",
      muted: "#81a1c1",
      accent: "#88c0d0",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#88c0d0",
      purple: "#b48ead",
      added: "#3b4846",
      removed: "#463b46",
    },
    { keyword: "#81a1c1", type: "#8fbcbb", number: "#b48ead" },
  ),
  "tokyo-night": preset(
    "Tokyo Night",
    {
      background: "#1a1b26",
      panel: "#16161e",
      border: "#3b4261",
      text: "#c0caf5",
      muted: "#565f89",
      accent: "#7aa2f7",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      purple: "#bb9af7",
      added: "#20303b",
      removed: "#37222c",
    },
    { type: "#2ac3de", number: "#ff9e64", operator: "#89ddff" },
  ),
} satisfies Record<string, ThemePreset>;

export function validateThemeSettings(settings: ThemeSettings, ctx: z.RefinementCtx) {
  for (const [id, definition] of Object.entries(settings.themes ?? {})) {
    if (Object.hasOwn(themePresets, id))
      ctx.addIssue({
        code: "custom",
        path: ["themes", id],
        message: "Custom theme names must not replace built-in presets",
      });
    if (!Object.hasOwn(themePresets, definition.extends))
      ctx.addIssue({
        code: "custom",
        path: ["themes", id, "extends"],
        message: `Unknown built-in theme: ${definition.extends}`,
      });
  }
  if (
    settings.theme &&
    !Object.hasOwn(themePresets, settings.theme) &&
    !Object.hasOwn(settings.themes ?? {}, settings.theme)
  )
    ctx.addIssue({ code: "custom", path: ["theme"], message: `Unknown theme: ${settings.theme}` });
}

export function resolveThemes(settings: ThemeSettings): Record<string, ThemePreset> {
  const registry: Record<string, ThemePreset> = { ...themePresets };
  for (const [id, definition] of Object.entries(settings.themes ?? {})) {
    const base = themePresets[definition.extends as keyof typeof themePresets].theme;
    registry[id] = {
      label: id,
      theme: {
        ...base,
        ...definition.colors,
        syntax: { ...base.syntax, ...definition.syntax },
        markdown: { ...base.markdown, ...definition.markdown },
      },
    };
  }
  return registry;
}

export function initialTheme(
  settings: ThemeSettings,
  saved: unknown,
  registry = resolveThemes(settings),
): string {
  if (settings.theme && Object.hasOwn(registry, settings.theme)) return settings.theme;
  return typeof saved === "string" && Object.hasOwn(registry, saved) ? saved : "dark";
}
