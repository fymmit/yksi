import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { modelOption, optionChoices, optionValueLabel } from "../src/session-options";

test("model selection skips booleans and resolves grouped choice labels in agent order", () => {
  const options: SessionConfigOption[] = [
    { id: "toggle", type: "boolean", category: "model", name: "Enabled", currentValue: false },
    {
      id: "first",
      type: "select",
      category: "model",
      name: "Model",
      currentValue: "b",
      options: [
        {
          group: "provider",
          name: "Provider",
          options: [
            { value: "a", name: "Alpha" },
            { value: "b", name: "Beta" },
          ],
        },
      ],
    },
    {
      id: "second",
      type: "select",
      category: "model",
      name: "Other",
      currentValue: "c",
      options: [{ value: "c", name: "Gamma" }],
    },
  ];
  const model = modelOption(options)!;
  expect(model.id).toBe("first");
  expect(optionChoices(model).map(choice => choice.value)).toEqual(["a", "b"]);
  expect(optionValueLabel(model)).toBe("Beta");
  expect(optionValueLabel({ ...model, currentValue: "unknown" })).toBe("unknown");
  expect(optionValueLabel(options[0]!)).toBe("Off");
});
