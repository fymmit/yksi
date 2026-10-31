import { createMemo } from "solid-js";
import type { Keybindings } from "../keybindings";
import { sessionMode } from "../modes";
import { optionValueLabel } from "../session-options";
import { changedFiles, type Session } from "../state";
import { selectionColors, type Theme } from "./theme";
import { formatCost } from "./usage";

const numbers = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const singleLine = (text: string) => text.replace(/[\r\n\t]/g, " ");

// Display order is independent of which fields get space first on narrow terminals.
const fieldLayout = {
  mode: { order: 0, priority: 2 },
  model: { order: 1, priority: 3 },
  thought_level: { order: 2, priority: 4 },
  context: { order: 3, priority: 0 },
  cost: { order: 4, priority: 1 },
  plan: { order: 5, priority: 5 },
  files: { order: 6, priority: 6 },
  other: { order: 7, priority: 9 },
};
type FieldKind = keyof typeof fieldLayout;

/** Truncate by terminal cells without splitting a grapheme or a wide character. */
function fit(text: string, width: number, truncate: "start" | "end" = "end") {
  text = singleLine(text);
  if (Bun.stringWidth(text) <= width) return text;
  if (width <= 0) return "";
  const graphemes = Array.from(segments.segment(text), value => value.segment);
  if (truncate === "start") graphemes.reverse();
  let result = "";
  for (const segment of graphemes) {
    const next = truncate === "start" ? segment + result : result + segment;
    if (Bun.stringWidth(next) > width - 1) break;
    result = next;
  }
  return truncate === "start" ? "…" + result : result + "…";
}

export function StatusBar(props: {
  session: Session;
  width: number;
  theme: Theme;
  keys: Keybindings;
  help: () => void;
}) {
  const help = () => fit(props.keys.hint("app.help", "Help"), Math.max(0, props.width - 2));
  const summary = createMemo(() => {
    const session = props.session;
    const compact = props.width < 100;
    const fields: { text: string; kind: FieldKind; id: string }[] = [];
    const add = (kind: FieldKind, label: string, value: string, id = "", forceLabel = false) =>
      fields.push({
        text: singleLine(compact && !forceLabel ? value : `${label}: ${value}`),
        kind,
        id,
      });
    for (const option of session.configOptions) {
      const value = optionValueLabel(option);
      const kind =
        option.category === "mode" ||
        option.category === "model" ||
        option.category === "thought_level"
          ? option.category
          : "other";
      add(
        kind,
        fit(option.name, 12),
        fit(String(value), compact ? 12 : 20, option.category === "model" ? "start" : "end"),
        option.id,
        option.type === "boolean" ||
          /^(on|off|yes|no|true|false|enabled|disabled)$/i.test(String(value).trim()),
      );
    }
    const mode = sessionMode(session);
    if (mode && !mode.configId)
      add(
        "mode",
        "Mode",
        fit(
          mode.options.find(value => value.value === mode.currentValue)?.name ??
            String(mode.currentValue),
          compact ? 12 : 20,
        ),
      );
    if (session.usage) {
      add(
        "context",
        "Context",
        `${numbers.format(session.usage.used).toLowerCase()}/${numbers.format(session.usage.size).toLowerCase()}`,
      );
      add(
        "cost",
        "Cost",
        session.usage.cost == null ? "Not reported" : formatCost(session.usage.cost),
      );
    }
    if (session.plan.length)
      add(
        "plan",
        "Plan",
        `${session.plan.filter(entry => entry.status === "completed").length}/${session.plan.length}`,
      );
    const count = changedFiles(session).length;
    if (count)
      add("files", "Files", compact ? `${count} ${count === 1 ? "file" : "files"}` : String(count));
    fields.sort(
      (a, b) =>
        fieldLayout[a.kind].order - fieldLayout[b.kind].order ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    let remaining = Math.max(0, props.width - 2 - Bun.stringWidth(help()) - 2);
    const selected = new Set<(typeof fields)[number]>();
    for (const field of [...fields].sort(
      (a, b) => fieldLayout[a.kind].priority - fieldLayout[b.kind].priority,
    )) {
      const width = Bun.stringWidth(field.text) + (selected.size ? 3 : 0);
      if (width <= remaining) {
        selected.add(field);
        remaining -= width;
      }
    }
    return fields
      .filter(field => selected.has(field))
      .map(field => field.text)
      .join(" · ");
  });
  return (
    <box height={1} flexShrink={0} paddingX={1} flexDirection="row" justifyContent="space-between">
      <text {...selectionColors(props.theme)} fg={props.theme.muted} height={1} minWidth={0}>
        {summary()}
      </text>
      <text
        {...selectionColors(props.theme)}
        fg={props.theme.accent}
        height={1}
        flexShrink={0}
        onMouseDown={props.help}
      >
        {help()}
      </text>
    </box>
  );
}
