import type { Session } from "./state";
import { optionChoices } from "./session-options";

/** A semantic mode selector, using config options in preference to legacy modes. */
export function sessionMode(session: Pick<Session, "configOptions" | "modes">) {
  const option = session.configOptions.find(option => option.category === "mode");
  if (option)
    return {
      configId: option.id,
      currentValue: option.currentValue,
      options:
        option.type === "boolean"
          ? [
              { value: false, name: "Off" },
              { value: true, name: "On" },
            ]
          : optionChoices(option),
      name: option.name,
    };
  if (session.configOptions.length || !session.modes) return;
  return {
    configId: undefined,
    currentValue: session.modes.currentModeId,
    options: session.modes.availableModes.map(mode => ({ value: mode.id, name: mode.name })),
    name: "Mode",
  };
}
