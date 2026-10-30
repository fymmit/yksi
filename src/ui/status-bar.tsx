import { createMemo } from "solid-js";
import type { Keybindings } from "../keybindings";
import { sessionMode } from "../modes";
import { changedFiles, type Session } from "../state";
import type { Theme } from "./theme";
import { formatCost } from "./usage";

const numbers = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const singleLine = (text: string) => text.replace(/[\r\n\t]/g, " ");

/** Truncate by terminal cells without splitting a grapheme or a wide character. */
function fit(text: string, width: number) {
  text = singleLine(text);
  if (Bun.stringWidth(text) <= width) return text;
  if (width <= 0) return "";
  let result = "";
  for (const { segment } of segments.segment(text)) {
    if (Bun.stringWidth(result + segment) > width - 1) break;
    result += segment;
  }
  return result + "…";
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
    const fields: { text: string; priority: number }[] = [];
    const add = (text: string, priority: number) =>
      fields.push({ text: singleLine(text), priority });
    add(fit(session.title, compact ? 12 : 24), 8);
    add(fit(session.agent, 16), 7);
    for (const option of session.configOptions) {
      const value =
        option.type === "boolean"
          ? option.currentValue
            ? "On"
            : "Off"
          : (option.options
              .flatMap(value => ("options" in value ? value.options : [value]))
              .find(value => value.value === option.currentValue)?.name ?? option.currentValue);
      const priority = option.category === "mode" ? 2 : option.category === "model" ? 3 : 9;
      add(`${fit(option.name, 12)}: ${fit(String(value), compact ? 12 : 20)}`, priority);
    }
    const mode = sessionMode(session);
    if (mode && !mode.configId)
      add(
        `Mode: ${fit(mode.options.find(value => value.value === mode.currentValue)?.name ?? String(mode.currentValue), compact ? 12 : 20)}`,
        2,
      );
    if (session.usage) {
      add(
        `${compact ? "Ctx" : "Context"} ${numbers.format(session.usage.used).toLowerCase()}/${numbers.format(session.usage.size).toLowerCase()}`,
        0,
      );
      add(session.usage.cost == null ? "Cost: Not reported" : formatCost(session.usage.cost), 1);
    }
    if (session.plan.length)
      add(
        `Plan ${session.plan.filter(entry => entry.status === "completed").length}/${session.plan.length}`,
        4,
      );
    const count = changedFiles(session).length;
    if (count) add(`${count} ${count === 1 ? "file" : "files"}`, 5);
    let remaining = Math.max(0, props.width - 2 - Bun.stringWidth(help()) - 2);
    const selected = new Set<(typeof fields)[number]>();
    for (const field of [...fields].sort((a, b) => a.priority - b.priority)) {
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
      <text fg={props.theme.muted} height={1} minWidth={0}>
        {summary()}
      </text>
      <text fg={props.theme.accent} height={1} flexShrink={0} onMouseDown={props.help}>
        {help()}
      </text>
    </box>
  );
}
