import { expect, test } from "bun:test";
import { configSchema } from "../src/config";
import {
  colorNames,
  syntaxNames,
  markdownNames,
  initialTheme,
  resolveThemes,
  themePresets,
} from "../src/themes";

test("every preset supplies a complete valid palette", () => {
  expect(Object.keys(themePresets)).toHaveLength(13);
  for (const [id, { theme }] of Object.entries(themePresets)) {
    expect(configSchema.parse({ theme: id }).theme).toBe(id);
    for (const key of colorNames) expect(theme[key]).toMatch(/^#[\da-f]{6}$/i);
    for (const key of syntaxNames) expect(theme.syntax[key]).toMatch(/^#[\da-f]{6}$/i);
    for (const key of markdownNames) expect(theme.markdown[key]).toMatch(/^#[\da-f]{6}$/i);
  }
});

test("custom themes inherit each group independently without mutating presets", () => {
  const config = configSchema.parse({
    theme: "my-mocha",
    themes: {
      "my-mocha": {
        extends: "catppuccin-mocha",
        colors: { background: "#010203", accent: "#ABCDEF" },
        syntax: { keyword: "#123456", constructor: "#112233" },
        markdown: { heading: "#fedcba" },
      },
      second: { extends: "catppuccin-mocha" },
    },
  });
  const registry = resolveThemes(config);
  const custom = registry["my-mocha"]!.theme;
  const base = themePresets["catppuccin-mocha"].theme;
  expect(custom.background).toBe("#010203");
  expect(custom.accent).toBe("#ABCDEF");
  expect(custom.panel).toBe(base.panel);
  expect(custom.syntax.keyword).toBe("#123456");
  expect(custom.syntax.constructor).toBe("#112233");
  expect(custom.syntax.string).toBe(base.syntax.string);
  expect(custom.markdown.heading).toBe("#fedcba");
  expect(custom.markdown.link).toBe(base.markdown.link);
  expect(registry.second!.theme).toEqual(base);
  expect(base.background).toBe("#1e1e2e");
  expect(base.syntax.keyword).toBe("#cba6f7");
  // Editing one group's colors must work without supplying other groups/scopes.
  expect(() =>
    configSchema.parse({ themes: { mine: { extends: "dark", syntax: { keyword: "#123456" } } } }),
  ).not.toThrow();
});

test("theme validation reports unknown names, keys, bases and invalid colors", () => {
  for (const [config, path] of [
    [{ theme: "missing" }, ["theme"]],
    [{ theme: "toString" }, ["theme"]],
    [{ themes: { mine: { extends: "missing" } } }, ["themes", "mine", "extends"]],
    [{ themes: { mine: { extends: "constructor" } } }, ["themes", "mine", "extends"]],
    [{ themes: { dark: { extends: "light" } } }, ["themes", "dark"]],
    [{ themes: { "Bad Name": { extends: "light" } } }, ["themes", "Bad Name"]],
    [
      { themes: { mine: { extends: "dark", colors: { background: "red" } } } },
      ["themes", "mine", "colors", "background"],
    ],
    [
      { themes: { mine: { extends: "dark", colors: { background: "#12345g" } } } },
      ["themes", "mine", "colors", "background"],
    ],
    [
      { themes: { mine: { extends: "dark", colors: { backgroud: "#123456" } } } },
      ["themes", "mine", "colors"],
    ],
    [
      { themes: { mine: { extends: "dark", syntax: { keywrod: "#123456" } } } },
      ["themes", "mine", "syntax"],
    ],
    [
      { themes: { mine: { extends: "dark", markdown: { headings: "#123456" } } } },
      ["themes", "mine", "markdown"],
    ],
    [{ themes: { mine: { extends: "dark", colour: {} } } }, ["themes", "mine"]],
  ] as const) {
    const parsed = configSchema.safeParse(config);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.map(issue => issue.path.slice(0, path.length))).toContainEqual([
        ...path,
      ]);
  }
});

test("startup uses explicit config, then valid saved selection, then dark", () => {
  const config = configSchema.parse({ themes: { mine: { extends: "nord" } } });
  expect(initialTheme(config, "mine")).toBe("mine");
  expect(initialTheme(config, "light")).toBe("light");
  expect(initialTheme({ ...config, theme: "github-dark" }, "mine")).toBe("github-dark");
  for (const saved of [undefined, null, 42, {}, "missing", "__proto__", "constructor", "toString"])
    expect(initialTheme(config, saved)).toBe("dark");
  expect(initialTheme(configSchema.parse({}), "mine")).toBe("dark");
});
