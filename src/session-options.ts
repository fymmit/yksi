import type { SessionConfigOption } from "@agentclientprotocol/sdk";

type SelectOption = Extract<SessionConfigOption, { type: "select" }>;

export function modelOption(options: readonly SessionConfigOption[]): SelectOption | undefined {
  return options.find(
    (option): option is SelectOption => option.category === "model" && option.type === "select",
  );
}

/** Preserve the agent's order, including choices inside groups. */
export function optionChoices(option: SelectOption) {
  return option.options.flatMap(choice => ("options" in choice ? choice.options : [choice]));
}

export function optionValueLabel(option: SessionConfigOption): string {
  if (option.type === "boolean") return option.currentValue ? "On" : "Off";
  return (
    optionChoices(option).find(choice => choice.value === option.currentValue)?.name ??
    option.currentValue
  );
}
